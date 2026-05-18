import { Router, Request } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const registrationRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const RegistrationRequestSchema = z.object({
  school_name_en: z.string().min(1),
  school_name_ar: z.string().optional(),
  contact_name: z.string().min(1),
  contact_email: z.string().email(),
  contact_phone: z.string().min(1),
  school_type: z.enum([
    'private',
    'international',
    'national',
    'vocational',
    'other',
  ]),
  city: z.string().min(1),
  country: z.string().default('SA'),
  student_count_range: z.string().optional(),
  notes: z.string().optional(),
});

registrationRouter.post('/request', async (req: Request, res) => {
  try {
    const parsed = RegistrationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: parsed.error.flatten(),
      });
    }

    const { data: existing } = await supabase
      .from('registration_requests')
      .select('id')
      .eq('contact_email', parsed.data.contact_email)
      .eq('status', 'pending')
      .single();

    if (existing) {
      return res.status(409).json({
        message:
          'A pending registration request already exists for this email',
      });
    }

    const { data: request, error } = await supabase
      .from('registration_requests')
      .insert({
        ...parsed.data,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Registration request submitted successfully',
      id: request.id,
    });
  } catch (err) {
    console.error('Failed to submit registration:', err);
    res.status(500).json({ message: 'Failed to submit registration request' });
  }
});
