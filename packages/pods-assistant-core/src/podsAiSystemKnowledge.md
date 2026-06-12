# Pods AI — Görev Atama (kaynak doküman)

Edge function system prompt kaynağı: `supabase/functions/pods-ai-task-assign/SYSTEM_KNOWLEDGE.md`

Bu dosyayı düzenleyip edge function'ı yeniden deploy edin:

```bash
supabase functions deploy pods-ai-task-assign --project-ref <ref>
```

Web/mobile kural motoru yalnızca intent parse + doğrulama yapar; kullanıcıya sorulan tüm sorular LLM `reply` alanından gelir.
