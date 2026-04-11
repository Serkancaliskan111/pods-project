-- Add contact fields to personeller to support records created without auth user
ALTER TABLE IF EXISTS personeller
ADD COLUMN IF NOT EXISTS ad_soyad VARCHAR(255),
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

