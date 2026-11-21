import { describe, expect, it, vi } from 'vitest';
import { resources } from '../i18n';
import { AI_FEATURES } from '../types/usage';
import { fetchUsage, formatCompact, totalTokens } from './usageApi';

describe('usage API (TIQ-23)', () => {
  it('asks the backend for the chosen period', async () => {
    const request = vi.fn().mockResolvedValue({});
    await fetchUsage(request, 'month');
    expect(request).toHaveBeenCalledWith('/admin/usage?period=month');
  });

  it('adds input and output tokens', () => {
    expect(totalTokens({ inputTokens: 1900, outputTokens: 1500 })).toBe(3400);
  });

  it('shortens big token counts', () => {
    expect(formatCompact(1_234_567, 'en')).toBe('1.2M');
    expect(formatCompact(950, 'en')).toBe('950');
  });

  it('every AI feature has a name in English and Somali', () => {
    for (const lang of ['en', 'so'] as const) {
      const names = resources[lang].translation.admin.usage.features as Record<string, string>;
      for (const feature of AI_FEATURES) expect(names[feature], `${lang}:${feature}`).toBeTruthy();
    }
  });
});
