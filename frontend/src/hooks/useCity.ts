import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'zchoose_city';
const DEFAULT_CITY = '绵阳';

export function useCity(): [string, (city: string) => void] {
  const [city, setCityState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_CITY;
    } catch {
      return DEFAULT_CITY;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, city);
    } catch {
      // ignore
    }
  }, [city]);

  const setCity = useCallback((next: string) => {
    setCityState(next);
  }, []);

  return [city, setCity];
}
