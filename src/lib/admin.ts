import { z } from 'zod';

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReviewStatus = typeof REVIEW_STATUSES[number];
export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  pending: 'Oczekujące', approved: 'Zatwierdzone', rejected: 'Odrzucone',
};
export type AdminActionState = { success: boolean; message: string };

export const reviewContributionSchema = z.discriminatedUnion('decision', [
  z.object({ id: z.uuid(), decision: z.literal('approved'), expectedUpdatedAt: z.iso.datetime() }),
  z.object({ id: z.uuid(), decision: z.literal('rejected') }),
]);
export type ReviewContribution = z.infer<typeof reviewContributionSchema>;

export const adminLoginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(1024),
});
