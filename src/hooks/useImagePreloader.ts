import { useState, useEffect } from 'react';

const CRITICAL_IMAGES = [
  '/images/backpack.png',
  '/images/Shop.png',
  '/images/Market.png',
  '/images/Storage.png',
  '/images/house.png',
  '/images/mini-house.png',
  '/images/garden-wheat.png',
  '/images/garden-tomato.png',
  '/images/garden-pumpkin.png',
  '/images/garden-apple.png',
  '/images/garden-peach.png',
  '/images/garden-cherry.png',
  '/images/garden-watering-can.png',
  '/images/garden-pick.png',
  '/images/garden-bin.png',
  '/images/sleep.png',
  '/images/tools-wood.png',
  '/images/tools-iron.png',
  '/images/tools-coins.png',
  '/images/tools-village.png',
  '/images/tools-map.png',
  '/images/settings.png',
  '/images/grey-cat.png',
  '/images/orange-cat.png',
  '/images/black-cat.png',
  '/images/work-racoon.png',
  '/images/vac-fox.png',
  '/images/grass texture.png',
  '/images/sand.jpg',
  '/images/water.jpg',
  '/images/onboarding-1.png',
  '/images/onboarding-2.png',
  '/images/onboarding-3.png',
  '/images/onboarding-4.png',
  '/images/onboarding-5.png',
  '/images/logo.png'
];

export const useImagePreloader = () => {
  const [imagesLoaded, setImagesLoaded] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const loadImage = (src: string) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(src);
        img.onerror = () => resolve(src); // Resolve anyway to not block
      });
    };

    Promise.all(CRITICAL_IMAGES.map(loadImage)).then(() => {
      if (!isCancelled) {
        setImagesLoaded(true);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  return imagesLoaded;
};
