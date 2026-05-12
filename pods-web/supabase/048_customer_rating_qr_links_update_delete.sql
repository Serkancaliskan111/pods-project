-- customer_unit_qr_links için yönetim aksiyonları
-- - QR pasife alma (yeniden oluşturma akışında update)
-- - QR silme

DROP POLICY IF EXISTS customer_qr_links_auth_update ON public.customer_unit_qr_links;
CREATE POLICY customer_qr_links_auth_update
ON public.customer_unit_qr_links
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS customer_qr_links_auth_delete ON public.customer_unit_qr_links;
CREATE POLICY customer_qr_links_auth_delete
ON public.customer_unit_qr_links
FOR DELETE
TO authenticated
USING (true);
