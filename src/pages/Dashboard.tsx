import { useEffect, useState } from "react";

import { useApp } from "../context";

export default function Dashboard() {
  const { db, t } = useApp();
  const [counts, setCounts] = useState({ clients: 0, cars: 0, contracts: 0 });

  useEffect(() => {
    const one = async (sql: string) =>
      (await db.select<{ c: number }>(sql))[0]?.c ?? 0;
    Promise.all([
      one("SELECT COUNT(*) AS c FROM clients"),
      one("SELECT COUNT(*) AS c FROM cars WHERE status = 'available'"),
      one("SELECT COUNT(*) AS c FROM contracts WHERE status = 'active'"),
    ]).then(([clients, cars, contracts]) => setCounts({ clients, cars, contracts }));
  }, [db]);

  return (
    <>
      <h1>{t("dashboard")}</h1>
      <ul className="counts">
        <li>
          {t("clients")}: {counts.clients}
        </li>
        <li>
          {t("available")}: {counts.cars}
        </li>
        <li>
          {t("active")}: {counts.contracts}
        </li>
      </ul>
    </>
  );
}
