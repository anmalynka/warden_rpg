/**
 * ShaderManager handles WebGL program lifecycle and uniform updates
 * for the Global World-Space Shader.
 */
export class ShaderManager {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram | null = null;
  private uniforms: { [key: string]: WebGLUniformLocation | null } = {};
  private textures: { [key: string]: WebGLTexture | null } = {};

  // GLSL Source Code
  private static readonly VERTEX_SHADER = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texCoord = a_texCoord;
    }
  `;

  private static readonly FRAGMENT_SHADER = `
    precision mediump float;
    
    uniform sampler2D u_overlay_tex;
    uniform sampler2D u_mask_tex;
    uniform vec2 u_camera_pos;
    uniform vec2 u_screen_size;
    uniform float u_scale;
    
    varying vec2 v_texCoord;

    void main() {
      // 1. Calculate current pixel's world position
      // v_texCoord is 0.0 to 1.0. Multiply by screen size to get screen pixels, 
      // then add camera offset for world-space anchoring.
      vec2 screen_pos = v_texCoord * u_screen_size;
      vec2 world_pos = screen_pos + u_camera_pos;

      // 2. Sample the overlay texture using world position scaled
      // Texture is set to gl.REPEAT for seamless tiling
      vec4 overlay_color = texture2D(u_overlay_tex, world_pos * u_scale);
      
      // 3. Sample the mask (base tile sprite)
      vec4 mask_color = texture2D(u_mask_tex, v_texCoord);

      // 4. Logic: If the base tile's Red channel is 1.0, apply overlay
      // We use the Red channel as a binary mask or intensity factor
      float mask_factor = mask_color.r;
      
      // Seamlessly mix the base tile color with the world-anchored overlay
      vec3 final_color = mix(mask_color.rgb, overlay_color.rgb, mask_factor);
      
      gl_FragColor = vec4(final_color, mask_color.a);
    }
  `;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: true });
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;
    this.initProgram();
  }

  private initProgram() {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, ShaderManager.VERTEX_SHADER);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, ShaderManager.FRAGMENT_SHADER);
    
    this.program = gl.createProgram();
    if (!this.program) return;
    
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(this.program) || "Link error");
    }

    this.uniforms = {
      u_overlay_tex: gl.getUniformLocation(this.program, "u_overlay_tex"),
      u_mask_tex: gl.getUniformLocation(this.program, "u_mask_tex"),
      u_camera_pos: gl.getUniformLocation(this.program, "u_camera_pos"),
      u_screen_size: gl.getUniformLocation(this.program, "u_screen_size"),
      u_scale: gl.getUniformLocation(this.program, "u_scale")
    };

    this.setupBuffers();
  }

  private compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) throw new Error("Failed to create shader");
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader) || "Compile error");
    }
    return shader;
  }

  private setupBuffers() {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // Full screen quad: pos(x,y), uv(u,v)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
      -1,  1, 0, 1,
       1, -1, 1, 0,
       1,  1, 1, 1,
    ]), gl.STATIC_DRAW);

    const posAttr = gl.getAttribLocation(this.program!, "a_position");
    const uvAttr = gl.getAttribLocation(this.program!, "a_texCoord");
    
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 16, 0);
    
    gl.enableVertexAttribArray(uvAttr);
    gl.vertexAttribPointer(uvAttr, 2, gl.FLOAT, false, 16, 8);
  }

  public setTexture(name: string, image: HTMLImageElement | HTMLCanvasElement, unit: number) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Seamless tiling configuration
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.textures[name] = texture;
    
    gl.useProgram(this.program);
    gl.uniform1i(this.uniforms[name], unit);
  }

  public setCamera(x: number, y: number) {
    this.gl.useProgram(this.program);
    this.gl.uniform2f(this.uniforms.u_camera_pos, x, y);
  }

  public setScreenSize(width: number, height: number) {
    this.gl.viewport(0, 0, width, height);
    this.gl.useProgram(this.program);
    this.gl.uniform2f(this.uniforms.u_screen_size, width, height);
  }

  public setOverlayScale(scale: number = 1/144) {
    this.gl.useProgram(this.program);
    this.gl.uniform1f(this.uniforms.u_scale, scale);
  }

  public render() {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
