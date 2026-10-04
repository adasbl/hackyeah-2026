import { z } from 'zod';
import { CARD_PROVIDER_SLUGS } from '@repo/types';

export const cardContributionSchema = z.object({
  placeSlug: z.string().trim().min(1).max(200).regex(/^[a-z0-9-]+$/),
  provider: z.enum(CARD_PROVIDER_SLUGS, { error: 'Wybierz kartę sportową.' }),
  status: z.enum(['accepted', 'conditional', 'not_accepted'], { error: 'Wybierz status akceptacji.' }),
  conditions: z.string().trim().max(1000, 'Warunki mogą mieć najwyżej 1000 znaków.'),
  sourceUrl: z.string().trim().max(2000, 'Link może mieć najwyżej 2000 znaków.').refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    } catch { return false; }
  }, 'Podaj poprawny link zaczynający się od https:// lub http://.'),
}).superRefine((input, ctx) => {
  if (input.status === 'conditional' && !input.conditions) {
    ctx.addIssue({ code: 'custom', path: ['conditions'], message: 'Opisz warunki korzystania z karty.' });
  }
});

export type CardContribution = z.infer<typeof cardContributionSchema>;
export type CardContributionState = {
  success: boolean;
  message: string;
  errors?: Partial<Record<keyof CardContribution, string>>;
};
