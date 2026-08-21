"use client";

import { useState } from "react";
import { Plus, Trash2, GripVertical, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/src/ui/atoms/Button";

/** What the reader picks. Held in its own terms, not the model's. */
export type SchemaType = "STRING" | "NUMBER" | "BOOLEAN";

/**
 * JSON Schema's own type names.
 *
 * This builder wrote `"OBJECT"` and `"STRING"` in capitals, which is the
 * convention of a *different* Vertex field — while the runtime handed the
 * result to `responseJsonSchema`, which is standard JSON Schema and lowercase.
 * So a shape built here was rejected by the one path that read it. Every
 * provider agrees on the lowercase spelling, so that is what is written now.
 */
const JSON_SCHEMA_TYPES: Record<SchemaType, "string" | "number" | "boolean"> = {
  STRING: "string",
  NUMBER: "number",
  BOOLEAN: "boolean",
};

const SCHEMA_TYPE_BY_JSON_TYPE: Record<string, SchemaType> = {
  string: "STRING",
  number: "NUMBER",
  boolean: "BOOLEAN",
  // Shapes saved before the spelling was fixed still open in the builder.
  STRING: "STRING",
  NUMBER: "NUMBER",
  BOOLEAN: "BOOLEAN",
};

export interface SchemaProperty {
  id: string; // for React keys
  keyName: string;
  type: SchemaType;
  description: string;
  isRequired: boolean;
}

type JsonSchemaProperty = {
  type?: string;
  description?: string;
};

type JsonSchemaObject = {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

interface JsonSchemaBuilderProps {
  initialSchemaJson?: string;
  onChange: (jsonString: string) => void;
  title: string;
  subtitle: string;
}

function createPropertyId() {
  return Math.random().toString(36).substr(2, 9);
}

function parseInitialProperties(initialSchemaJson?: string): SchemaProperty[] {
  if (!initialSchemaJson) return [];

  try {
    const parsed = JSON.parse(initialSchemaJson) as JsonSchemaObject;
    // Either spelling opens, so a shape saved before the fix is still editable.
    if ((parsed.type !== "object" && parsed.type !== "OBJECT") || !parsed.properties) return [];

    const requiredArr = parsed.required || [];
    return Object.entries(parsed.properties).map(([key, value]) => ({
      id: createPropertyId(),
      keyName: key,
      type: SCHEMA_TYPE_BY_JSON_TYPE[value.type ?? "string"] ?? "STRING",
      description: value.description || "",
      isRequired: requiredArr.includes(key),
    }));
  } catch (e) {
    console.error("Failed to parse initial schema", e);
    return [];
  }
}

export default function JsonSchemaBuilder({ initialSchemaJson, onChange, title, subtitle }: JsonSchemaBuilderProps) {
  const t = useTranslations("ui.jsonSchemaBuilder");
  const [properties, setProperties] = useState<SchemaProperty[]>(() => parseInitialProperties(initialSchemaJson));

  // Compile back to JSON whenever properties change
  const compileSchema = (props: SchemaProperty[]) => {
    const propertiesObj: Record<string, JsonSchemaProperty> = {};
    const requiredKeys: string[] = [];

    props.forEach(p => {
      if (!p.keyName.trim()) return;
      
      propertiesObj[p.keyName] = { 
        type: JSON_SCHEMA_TYPES[p.type], 
        ...(p.description.trim() ? { description: p.description.trim() } : {})
      };
      
      if (p.isRequired) {
        requiredKeys.push(p.keyName);
      }
    });

    // Only broadcast if there's actually a schema
    if (Object.keys(propertiesObj).length === 0) {
      onChange("");
      return;
    }

    const finalSchema = {
      type: "object",
      properties: propertiesObj,
      ...(requiredKeys.length > 0 ? { required: requiredKeys } : {})
    };

    onChange(JSON.stringify(finalSchema, null, 2));
  };

  const handleAddProperty = () => {
    const newProps: SchemaProperty[] = [
      ...properties, 
      { id: createPropertyId(), keyName: "", type: "STRING", description: "", isRequired: true }
    ];
    setProperties(newProps);
    compileSchema(newProps);
  };

  const handleRemoveProperty = (id: string) => {
    const newProps = properties.filter(p => p.id !== id);
    setProperties(newProps);
    compileSchema(newProps);
  };

  const updateProperty = (id: string, updates: Partial<SchemaProperty>) => {
    const newProps = properties.map(p => p.id === id ? { ...p, ...updates } : p);
    setProperties(newProps);
    compileSchema(newProps);
  };

  return (
    <div className="flex flex-col gap-4 w-full bg-black/20 border border-border-dim rounded-[16px] p-5">
      <div className="flex items-center justify-between border-b border-border-dim/50 pb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-brand" />
            {title}
          </h3>
          <p className="text-[12px] text-secondary mt-1">{subtitle}</p>
        </div>
        <Button
          variant="quiet"
          onClick={handleAddProperty}
          className="flex items-center gap-1.5 bg-foreground/10 hover:bg-foreground/20 text-foreground"
        >
          <Plus className="w-3.5 h-3.5" />
          {t("addField")}
        </Button>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        {properties.length === 0 ? (
          <div className="w-full rounded-[12px] border border-dashed border-border-dim/50 py-8 text-center text-[13px] text-muted">
            {t("empty")}
          </div>
        ) : (
          properties.map((prop) => (
            <div key={prop.id} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-card/50 p-3 rounded-[12px] border border-border-dim group transition-colors hover:border-brand/30">
               
               <div className="flex items-center gap-2 self-stretch sm:self-auto text-muted handle cursor-grab">
                 <GripVertical className="w-4 h-4" />
               </div>

               <div className="flex items-center flex-1 gap-3 w-full">
                  <input 
                    type="text"
                    value={prop.keyName}
                    onChange={e => updateProperty(prop.id, { keyName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })}
                    placeholder={t("fieldNamePlaceholder")}
                    className="flex-1 bg-transparent border-b border-dashed border-border-dim focus:border-brand outline-none px-2 py-1.5 text-[13px] font-mono text-foreground placeholder:text-muted transition-colors min-w-[120px]"
                  />

                  <select
                    value={prop.type}
                    onChange={e => updateProperty(prop.id, { type: e.target.value as SchemaType })}
                    className="bg-foreground/5 border border-border-dim rounded-[6px] px-2 py-1 text-[11px] font-bold tracking-widest uppercase text-foreground outline-none appearance-none min-w-[90px]"
                  >
                    <option value="STRING">{t("typeString")}</option>
                    <option value="NUMBER">{t("typeNumber")}</option>
                    <option value="BOOLEAN">{t("typeBoolean")}</option>
                  </select>
               </div>

               <input 
                 type="text"
                 value={prop.description}
                 onChange={e => updateProperty(prop.id, { description: e.target.value })}
                 placeholder={t("descriptionPlaceholder")}
                 className="flex-[2] w-full bg-transparent border-none outline-none px-2 py-1.5 text-[12px] text-foreground/80 placeholder:text-muted/60"
               />

               <div className="flex items-center gap-4 shrink-0 mt-3 sm:mt-0 px-2 sm:px-0">
                 <label className="flex items-center gap-2 cursor-pointer">
                   <div className="relative inline-flex items-center">
                     <input 
                       type="checkbox" 
                       checked={prop.isRequired}
                       onChange={e => updateProperty(prop.id, { isRequired: e.target.checked })}
                       className="sr-only peer" 
                     />
                     <div className="w-8 h-4 bg-foreground/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand"></div>
                   </div>
                   <span className="text-[11px] text-muted transition-colors peer-checked:text-foreground">{t("always")}</span>
                 </label>

                 <Button
                   variant="icon"
                   onClick={() => handleRemoveProperty(prop.id)}
                   className="p-1.5 rounded-[6px] text-muted hover:text-rose-500 hover:bg-rose-500/10"
                 >
                   <Trash2 className="w-3.5 h-3.5" />
                 </Button>
               </div>

            </div>
          ))
        )}
      </div>
    </div>
  );
}
