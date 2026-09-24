import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import logo from "../../extension/icons/icon32.png"

import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Mode = "moderate" | "strict"

const MODES = [
  { value: "moderate", label: "Medium" },
  { value: "strict", label: "High" },
] as const

// вне расширения (предпросмотр в браузере) chrome-API нет
const ext =
  typeof chrome !== "undefined" && chrome.storage?.sync ? chrome : null

export default function App() {
  const [enabled, setEnabled] = useState(true)
  const [mode, setMode] = useState<Mode>("moderate")

  useEffect(() => {
    ext?.storage.sync.get({ enabled: true, mode: "moderate" }).then((s) => {
      setEnabled(Boolean(s.enabled))
      setMode(s.mode === "strict" ? "strict" : "moderate")
    })
  }, [])

  function toggle(next: boolean) {
    setEnabled(next)
    ext?.storage.sync.set({ enabled: next })
  }

  function pick(next: string) {
    if (next !== "moderate" && next !== "strict") return // Radix шлёт "" при повторном клике
    setMode(next)
    ext?.storage.sync.set({ mode: next })
  }

  return (
    <div className="w-[300px] bg-white px-7 pt-8 pb-9 font-sans text-neutral-900 antialiased">
      <div className="flex items-center justify-center gap-2">
        <img src={logo} alt="" className="size-5 rounded-full object-cover" />
        <span className="text-[15px] font-semibold tracking-tight">
          Qalqan
        </span>
      </div>

      <div className="mt-9 flex justify-center">
        <Switch
          size="xl"
          checked={enabled}
          onCheckedChange={toggle}
          aria-label="Enable comment filtering"
          className="shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] data-checked:bg-emerald-500 data-unchecked:bg-neutral-200"
        >
          <Check
            className={`size-4 text-emerald-500 transition-opacity duration-200 ${
              enabled ? "opacity-100" : "opacity-0"
            }`}
            strokeWidth={3.25}
          />
        </Switch>
      </div>

      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={pick}
        spacing={0}
        disabled={!enabled}
        className={`mt-9 grid w-full grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 transition-opacity duration-200 ${
          enabled ? "" : "pointer-events-none opacity-40"
        }`}
      >
        {MODES.map((m) => (
          <ToggleGroupItem
            key={m.value}
            value={m.value}
            className="h-9 rounded-lg text-[13px] font-medium text-neutral-500 transition-all duration-200 hover:bg-transparent hover:text-neutral-700 data-[state=on]:bg-white data-[state=on]:font-semibold data-[state=on]:text-neutral-900 data-[state=on]:shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_10px_-3px_rgba(0,0,0,0.16)]"
          >
            {m.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
