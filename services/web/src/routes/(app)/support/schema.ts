import { z } from "zod";

export const supportRequestSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  email: z.email({ message: "Invalid email address" }),
  subject: z.string().min(1, "Subject is required").max(200, "Subject is too long"),
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message is too long"),
});

export type SupportRequest = z.infer<typeof supportRequestSchema>;
