import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScrollTabBar from './ScrollTabBar.jsx';

function mockOverflow(scroller, { scrollWidth = 500, clientWidth = 200, scrollLeft = 0 } = {}) {
  Object.defineProperty(scroller, 'scrollWidth', { configurable: true, get: () => scrollWidth });
  Object.defineProperty(scroller, 'clientWidth', { configurable: true, get: () => clientWidth });
  Object.defineProperty(scroller, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeft,
    set: (next) => { scrollLeft = next; },
  });
  fireEvent.scroll(scroller);
}

describe('ScrollTabBar', () => {
  it('keeps tabs in a single row and shows next when they overflow', () => {
    const { container } = render(
      <ScrollTabBar value="one">
        <button type="button" data-tab="one">One</button>
        <button type="button" data-tab="two">Two</button>
        <button type="button" data-tab="three">Three</button>
      </ScrollTabBar>,
    );
    const scroller = container.querySelector('[data-tab-scroller]');
    expect(scroller.className).toMatch(/overflow-x-auto/);
    expect(scroller.className).not.toMatch(/flex-wrap/);
    expect(screen.queryByRole('button', { name: 'Next tabs' })).toBeNull();

    mockOverflow(scroller);
    expect(screen.getByRole('button', { name: 'Next tabs' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous tabs' })).toBeNull();
  });

  it('shows a back arrow after scrolling, and hides next at the end', () => {
    const { container } = render(
      <ScrollTabBar>
        <button type="button" data-tab="one">One</button>
        <button type="button" data-tab="two">Two</button>
      </ScrollTabBar>,
    );
    const scroller = container.querySelector('[data-tab-scroller]');
    mockOverflow(scroller, { scrollLeft: 40 });
    expect(screen.getByRole('button', { name: 'Previous tabs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next tabs' })).toBeInTheDocument();

    mockOverflow(scroller, { scrollLeft: 300 });
    expect(screen.getByRole('button', { name: 'Previous tabs' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next tabs' })).toBeNull();
  });
});
