import { z } from 'zod';

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReviewStatus = typeof REVIEW_STATUSES[number];
export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  pending: 'Oczekujące', approved: 'Zatwierdzone', rejected: 'Odrzucone',
};
export type AdminActionState = { success: boolean; message: string };

export const reviewContributionSchema = z.object({
  id: z.uuid(),
  decision: z.enum(['approved', 'rejected']),
  expectedUpdatedAt: z.iso.datetime(),
  note: z.string().trim().max(1000),
});
export type ReviewContribution = z.infer<typeof reviewContributionSchema>;

export const adminLoginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(1024),
});
