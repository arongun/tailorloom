-- Add missing enum values for Calendly and POS sources
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'rescheduled';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'void';
