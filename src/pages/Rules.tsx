import { useEffect, useState } from "react";

import { useApp } from "../context";
import { setShopRules, shopRules } from "../db";
import type { Rules as RuleValues } from "../money";
import RulesForm from "../RulesForm";

/** The shop's late-fee rules, copied onto every contract written from now on. */
export default function Rules() {
  const { db, t } = useApp();
  const [rules, setRules] = useState<RuleValues | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    shopRules(db).then(setRules);
  }, [db]);

  return (
    <>
      <div className="pagehead">
        <h1>{t("rules")}</h1>
      </div>
      {rules && (
        <RulesForm
          key={JSON.stringify(rules)}
          rules={rules}
          intro={t("rules_new_only")}
          notice={saved ? t("saved") : undefined}
          onSave={async (next) => {
            await setShopRules(db, next);
            setRules(next);
            setSaved(true);
          }}
        />
      )}
    </>
  );
}
