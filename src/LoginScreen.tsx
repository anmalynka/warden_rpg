import React, { useState } from 'react';

const LoginScreen = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username && password) {
      onLogin(username);
    }
  };

  return (
    <div className="fixed inset-0 z-[5000] bg-[#1d3a19] flex items-center justify-center p-6 font-['Press_Start_2P']">
      <div className="w-full max-w-sm bg-[#8d6e63] border-4 border-[#3e2723] p-8 rounded-lg shadow-2xl pixel-border">
        <h1 className="text-white text-xl text-center mb-8 drop-shadow-md">WARDEN RPG</h1>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-[#3e2723] text-[10px]">USERNAME</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-[#5d4037] border-2 border-[#3e2723] p-3 text-white text-[10px] focus:outline-none focus:border-[#4caf50]"
              placeholder="ENTER NAME..."
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-[#3e2723] text-[10px]">PASSWORD</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-[#5d4037] border-2 border-[#3e2723] p-3 text-white text-[10px] focus:outline-none focus:border-[#4caf50]"
              placeholder="********"
            />
          </div>

          <button 
            type="submit"
            className="mt-4 btn-off-white p-4 text-[12px] font-bold"
          >
            ENTER WORLD
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;
