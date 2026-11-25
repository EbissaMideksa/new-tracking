// lib/woTemplates.ts
// Default work order templates for common maintenance tasks.
// Stored in the SystemSetting key "wo_templates" as a JSON array.
// Admins can add/edit templates via the settings page.

export interface WOTemplate {
  id: string
  title: string
  description: string
  priority: "LOW" | "MEDIUM" | "HIGH"
  category: string
}

export const DEFAULT_WO_TEMPLATES: WOTemplate[] = [
  {
    id: "tpl-generator-monthly",
    title: "Generator Monthly Inspection",
    description: "Monthly generator maintenance:\n- Check oil and coolant levels\n- Inspect fuel system for leaks\n- Test battery and charging system\n- Check air filter\n- Run test under load\n- Record running hours",
    priority: "MEDIUM",
    category: "PWR.GEN",
  },
  {
    id: "tpl-ups-quarterly",
    title: "UPS Quarterly Maintenance",
    description: "Quarterly UPS system check:\n- Inspect battery terminals for corrosion\n- Test battery voltage per cell\n- Verify alarm indicators\n- Check inverter output\n- Clean ventilation\n- Record battery age and replacement date",
    priority: "MEDIUM",
    category: "PWR.UPS",
  },
  {
    id: "tpl-ac-service",
    title: "AC Unit Service",
    description: "Air conditioning service:\n- Clean or replace filters\n- Check refrigerant level\n- Inspect condensate drain\n- Verify thermostat operation\n- Check electrical connections\n- Clean condenser and evaporator coils",
    priority: "LOW",
    category: "COOL.AC",
  },
  {
    id: "tpl-battery-replacement",
    title: "Battery Replacement",
    description: "Battery bank replacement:\n- Identify expired batteries (check warranty)\n- Order replacement batteries\n- Schedule downtime window\n- Replace batteries following safety procedures\n- Test new battery bank\n- Update asset records",
    priority: "HIGH",
    category: "PWR.BATT",
  },
  {
    id: "tpl-ran-site-visit",
    title: "RAN Site Visit Inspection",
    description: "Radio Access Network site visit:\n- Inspect antenna mounts and cables\n- Check BTS equipment status\n- Verify power supply and backup\n- Test signal quality\n- Inspect grounding system\n- Document any physical damage",
    priority: "MEDIUM",
    category: "WLN.RAN",
  },
  {
    id: "tpl-fiber-inspection",
    title: "Fiber Optic Cable Inspection",
    description: "Fiber optic cable inspection:\n- Visual inspection of cable runs\n- Check splice closures\n- OTDR test for signal loss\n- Clean connectors\n- Verify optical power levels\n- Document any degradation",
    priority: "MEDIUM",
    category: "TRX.OTN",
  },
  {
    id: "tpl-emergency-repair",
    title: "Emergency Repair",
    description: "Emergency equipment repair:\n- Assess damage/failure\n- Isolate affected equipment\n- Perform emergency repair\n- Test restored functionality\n- Document root cause\n- Schedule follow-up preventive maintenance",
    priority: "HIGH",
    category: "",
  },
]

export function getTemplatesFromSetting(json: string | null): WOTemplate[] {
  if (!json) return DEFAULT_WO_TEMPLATES
  try {
    const parsed = JSON.parse(json)
    if (Array.isArray(parsed)) return parsed
    return DEFAULT_WO_TEMPLATES
  } catch {
    return DEFAULT_WO_TEMPLATES
  }
}
