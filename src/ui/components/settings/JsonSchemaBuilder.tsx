"use client";

import { useState } from "react";
import { Plus, Trash2, GripVertical, Settings2 } from "lucide-react";

export type SchemaType = "STRING" | "NUMBER" | "BOOLEAN";

export interface SchemaProperty {
  id: string; // for React keys
  keyName: string;
  type: SchemaType;
  description: string;
  isRequired: boolean;
}

type JsonSchemaProperty = {
  type?: SchemaType;
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
    if (parsed.type !== "OBJECT" || !parsed.properties) return [];

    const requiredArr = parsed.required || [];
    return Object.entries(parsed.properties).map(([key, value]) => ({
      id: createPropertyId(),
      keyName: key,
      type: value.type || "STRING",
      description: value.description || "",
      isRequired: requiredArr.includes(key),
    }));
  } catch (e) {
    console.error("Failed to parse initial schema", e);
    return [];
  }
}

export default function JsonSchemaBuilder({ initialSchemaJson, onChange, title, subtitle }: JsonSchemaBuilderProps) {
  const [properties, setProperties] = useState<SchemaProperty[]>(() => parseInitialProperties(initialSchemaJson));

  // Compile back to JSON whenever properties change
  const compileSchema = (props: SchemaProperty[]) => {
    const propertiesObj: Record<string, JsonSchemaProperty> = {};
    const requiredKeys: string[] = [];

    props.forEach(p => {
      if (!p.keyName.trim()) return;
      
      propertiesObj[p.keyName] = { 
        type: p.type, 
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
      type: "OBJECT",
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
        <button
          type="button"
          onClick={handleAddProperty}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-foreground/10 hover:bg-foreground/20 text-foreground transition-colors text-[12px] font-medium border border-border-dim"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Node
        </button>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        {properties.length === 0 ? (
          <div className="w-full py-8 text-center text-muted text-[13px] font-mono border border-dashed border-border-dim/50 rounded-[12px]">
            No schema nodes declared. Dynamic structure implicitly inferred.
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
                    placeholder="key_identifier"
                    className="flex-1 bg-transparent border-b border-dashed border-border-dim focus:border-brand outline-none px-2 py-1.5 text-[13px] font-mono text-foreground placeholder:text-muted transition-colors min-w-[120px]"
                  />

                  <select
                    value={prop.type}
                    onChange={e => updateProperty(prop.id, { type: e.target.value as SchemaType })}
                    className="bg-foreground/5 border border-border-dim rounded-[6px] px-2 py-1 text-[11px] font-bold tracking-widest uppercase text-foreground outline-none appearance-none min-w-[90px]"
                  >
                    <option value="STRING">String</option>
                    <option value="NUMBER">Number</option>
                    <option value="BOOLEAN">Boolean</option>
                  </select>
               </div>

               <input 
                 type="text"
                 value={prop.description}
                 onChange={e => updateProperty(prop.id, { description: e.target.value })}
                 placeholder="Tell LLM exactly what to extract for this key..."
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
                   <span className="text-[11px] font-bold uppercase tracking-widest text-muted peer-checked:text-foreground transition-colors">Req</span>
                 </label>

                 <button
                   onClick={() => handleRemoveProperty(prop.id)}
                   className="p-1.5 text-muted hover:text-rose-500 rounded-[6px] hover:bg-rose-500/10 transition-colors"
                 >
                   <Trash2 className="w-3.5 h-3.5" />
                 </button>
               </div>

            </div>
          ))
        )}
      </div>
    </div>
  );
}
