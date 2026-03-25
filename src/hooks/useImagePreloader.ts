import { useEffect } from 'react';

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
  '/images/settings.png'
];

export const useImagePreloader = () => {
  useEffect(() => {
    CRITICAL_IMAGES.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);
};
