import { displayName, greetingFor, initials } from '../src/utils/greeting';

describe('Home greeting helpers', () => {
  it('picks morning / afternoon / evening by the hour', () => {
    expect(greetingFor(0)).toBe('morning');
    expect(greetingFor(11)).toBe('morning');
    expect(greetingFor(12)).toBe('afternoon');
    expect(greetingFor(17)).toBe('afternoon');
    expect(greetingFor(18)).toBe('evening');
    expect(greetingFor(23)).toBe('evening');
  });

  it('uses the email name part and two initials', () => {
    expect(displayName('amina.yusuf@example.com')).toBe('amina.yusuf');
    expect(initials('amina.yusuf')).toBe('AM');
    expect(initials('a')).toBe('A');
  });
});
