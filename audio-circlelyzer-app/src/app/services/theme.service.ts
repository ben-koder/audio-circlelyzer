import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  public currentTheme = signal<string>('dark');

  constructor() {
    this.loadTheme();
  }

  setTheme(theme: string): void {
    document.documentElement.setAttribute('data-theme', theme);
    this.currentTheme.set(theme);
    localStorage.setItem('theme', theme);
  }

  loadTheme(): void {
    const saved = localStorage.getItem('theme') || 'dark';
    this.setTheme(saved);
  }

  toggleTheme(): void {
    const newTheme = this.currentTheme() === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }
}
