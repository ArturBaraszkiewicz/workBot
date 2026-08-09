declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    panelAccess: import("@/lib/auth/panel-principal").PanelAccess;
  }
}
