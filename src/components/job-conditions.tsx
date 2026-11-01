"use client";
import { Button, Input, InputNumber, Select, Switch } from "antd";
import { Plus, Trash2 } from "lucide-react";
import { conditionFields, operators, type ScreeningCondition } from "../screening/conditions";

export function ConditionInput({ condition, value, onChange, disabled }: { condition: ScreeningCondition; value: unknown; onChange: (v: boolean | number | string | null) => void; disabled?: boolean }) {
  const label = condition.label;
  if (condition.valueType === "boolean") return <Select aria-label={label} disabled={disabled} allowClear placeholder="未确认" value={typeof value === "boolean" ? value ? "yes" : "no" : undefined} onChange={v => onChange(v == null ? null : v === "yes")} options={[{ value: "yes", label: "是" }, { value: "no", label: "否" }]} />;
  if (condition.valueType === "number") return <InputNumber aria-label={label} disabled={disabled} min={0} max={condition.fieldKey === "internshipDays" ? 7 : 999} value={value as number | null} onChange={onChange} placeholder="未确认" />;
  if (condition.valueType === "date") return <Input aria-label={label} disabled={disabled} type="date" value={typeof value === "string" ? value : ""} onChange={e => onChange(e.target.value || null)} />;
  return <Select aria-label={label} disabled={disabled} allowClear placeholder="未确认" value={value as string | undefined} onChange={v => onChange(v ?? null)} options={(condition.options ?? []).map(value => ({ value, label: value }))} />;
}
export default function JobConditions({ value = [], onChange }: { value?: ScreeningCondition[]; onChange?: (v: ScreeningCondition[]) => void }) {
  const update = (id: string, patch: Partial<ScreeningCondition>) => onChange?.(value.map(c => c.conditionId === id ? { ...c, ...patch } : c));
  return <div className="job-conditions"><p className="muted">按岗位添加必要要求或普通偏好。仅用于沟通确认，不从简历推测；未配置时不代表已通过核验。</p>
    {value.map((c,i) => <div className="job-condition" key={c.conditionId}>
      <div className="condition-heading"><strong>条件 {i+1}</strong><span><Switch size="small" checked={c.enabled} onChange={enabled => update(c.conditionId,{enabled})} aria-label={`启用条件 ${i+1}`} /> 启用</span><Button type="text" danger aria-label={`删除条件 ${i+1}`} icon={<Trash2 size={15}/>} onClick={() => onChange?.(value.filter(row => row.conditionId !== c.conditionId))}/></div>
      <div className="condition-config-grid"><div className="condition-field">业务字段<Select aria-label={`业务字段 ${i+1}`} value={c.fieldKey} onChange={fieldKey => update(c.conditionId,{fieldKey,label:conditionFields[fieldKey].label,valueType:conditionFields[fieldKey].type,operator:"eq",expectedValue:null,options:fieldKey === "workMode" ? ["现场办公","混合办公","远程办公"] : []})} options={Object.entries(conditionFields).map(([value,f]) => ({value,label:f.label}))}/></div>
      <div className="condition-field">条件名称<Input aria-label={`条件名称 ${i+1}`} value={c.label} maxLength={80} onChange={e=>update(c.conditionId,{label:e.target.value})}/></div>
      <div className="condition-field">比较方式<Select aria-label={`比较方式 ${i+1}`} value={c.operator} onChange={operator=>update(c.conditionId,{operator})} options={Object.entries(operators).filter(([key])=> !["boolean","enum"].includes(c.valueType) || ["eq","ne"].includes(key)).map(([value,label])=>({value,label}))}/></div>
      <div className="condition-field">要求值<ConditionInput condition={c} value={c.expectedValue} onChange={expectedValue=>update(c.conditionId,{expectedValue})}/></div>
      <div className="condition-field">重要性<Select aria-label={`重要性 ${i+1}`} value={c.required ? "required" : "optional"} options={[{value:"required",label:"必要条件"},{value:"optional",label:"普通偏好"}]} onChange={v=>update(c.conditionId,{required:v === "required"})}/></div>
      {c.valueType === "enum" && <div className="condition-field">可选项<Select aria-label={`枚举选项 ${i+1}`} mode="tags" value={c.options ?? []} tokenSeparators={[",","，"]} onChange={options=>update(c.conditionId,{options,expectedValue:options.includes(String(c.expectedValue))?c.expectedValue:null})}/></div>}</div>
    </div>)}
    <Button icon={<Plus size={14}/>} disabled={value.length >= 20} onClick={()=>onChange?.([...value,{conditionId:crypto.randomUUID(),label:conditionFields.acceptsLocation.label,fieldKey:"acceptsLocation",valueType:"boolean",operator:"eq",expectedValue:true,required:true,enabled:true}])}>添加筛选条件</Button>
  </div>;
}
