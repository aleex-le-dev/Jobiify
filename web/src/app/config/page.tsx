import { ConfigForm } from "@/components/config-form";
import { ObsidianSync } from "@/components/obsidian-sync";

export default function ConfigPage() {
  return (
    <>
      <ConfigForm />
      <div className="mx-auto max-w-3xl px-6 pb-10">
        <ObsidianSync />
      </div>
    </>
  );
}
