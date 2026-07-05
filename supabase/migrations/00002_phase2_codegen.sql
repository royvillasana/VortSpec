-- Phase 2: Component Factory schema additions

-- Project configuration
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS framework TEXT DEFAULT 'react';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS style_library TEXT DEFAULT 'tailwind';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS component_library TEXT DEFAULT 'none';

-- Code artifacts
CREATE TABLE IF NOT EXISTS public.code_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  framework TEXT NOT NULL,
  component_code TEXT NOT NULL,
  story_code TEXT,
  types_code TEXT,
  token_css TEXT,
  llm_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.code_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project-scoped select" ON public.code_artifacts
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));
CREATE POLICY "Project-scoped insert" ON public.code_artifacts
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));
CREATE POLICY "Project-scoped delete" ON public.code_artifacts
  FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));
