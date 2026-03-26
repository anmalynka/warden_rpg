import React, { useState, useEffect } from 'react';
import './Onboarding.css';

const ONBOARDING_DATA = [
  {
    image: '/images/onboarding-1.png',
    text: "Life had become a loud, iron machine. I was surrounded by millions, yet fading into the gray. I couldn't remember the last time I saw the sky."
  },
  {
    image: '/images/onboarding-2.png',
    text: "I left the noise behind without a map, only a need for silence. As the ship cut the mist, the air finally tasted like freedom."
  },
  {
    image: '/images/onboarding-3.png',
    text: "The island emerged like a miracle from the haze. Ancient roots reached out like old friends. For the first time, the weight in my chest lifted."
  },
  {
    image: '/images/onboarding-4.png',
    text: "It started with one seed and a roof against the rain. I wasn't just building a house; I was learning how to breathe again."
  },
  {
    image: '/images/onboarding-5.png',
    text: "Peace is a light that others can see. We built a pact under the great trees to protect this place. We didn't just find an island—we found home."
  }
];

interface OnboardingOverlayProps {
  onComplete: () => void;
  onSkip: () => void;
}

const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    let index = 0;
    const fullText = ONBOARDING_DATA[currentStep].text;
    setDisplayedText('');
    setIsTyping(true);

    const interval = setInterval(() => {
      setDisplayedText(fullText.slice(0, index + 1));
      index++;
      if (index >= fullText.length) {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, 30);

    return () => clearInterval(interval);
  }, [currentStep]);

  const handleNext = () => {
    if (isTyping) {
      // If still typing, skip to full text
      setDisplayedText(ONBOARDING_DATA[currentStep].text);
      setIsTyping(false);
      return;
    }

    if (currentStep < ONBOARDING_DATA.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="onboarding-overlay">
      {ONBOARDING_DATA.map((step, idx) => (
        <div
          key={idx}
          className="onboarding-bg"
          style={{
            backgroundImage: `url(${step.image})`,
            opacity: currentStep === idx ? 1 : 0,
            zIndex: currentStep === idx ? 1 : 0
          }}
        />
      ))}

      <div className="onboarding-dialog-container" style={{ zIndex: 10 }}>
        <div className="onboarding-step-counter">
          Step {currentStep + 1} of {ONBOARDING_DATA.length}
        </div>
        
        <p className="onboarding-text">
          {displayedText}
        </p>

        <div className="onboarding-controls">
          <button className="onboarding-btn-skip" onClick={onSkip}>
            Skip Story
          </button>
          <button className="onboarding-btn-next" onClick={handleNext}>
            {currentStep === ONBOARDING_DATA.length - 1 ? 'Start journey' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingOverlay;
