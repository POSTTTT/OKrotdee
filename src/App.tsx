import { Link, NavLink, Route, Routes } from "react-router-dom";

import { useApp } from "./context";
import CarDetail from "./pages/CarDetail";
import CarForm from "./pages/CarForm";
import Cars from "./pages/Cars";
import Calendar from "./pages/Calendar";
import ClientDetail from "./pages/ClientDetail";
import ClientForm from "./pages/ClientForm";
import Clients from "./pages/Clients";
import ContractDetail from "./pages/ContractDetail";
import ContractForm from "./pages/ContractForm";
import FeeForm from "./pages/FeeForm";
import LateFees from "./pages/LateFees";
import Contracts from "./pages/Contracts";
import Dashboard from "./pages/Dashboard";
import PaymentForm from "./pages/PaymentForm";

export default function App() {
  const { t, lang, setLang } = useApp();
  const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? "on" : "");

  return (
    <>
      <header>
        <Link className="brand" to="/">
          {t("app_name")}
        </Link>
        <nav>
          <NavLink to="/" end className={navClass}>
            {t("dashboard")}
          </NavLink>
          <NavLink to="/calendar" className={navClass}>
            {t("calendar")}
          </NavLink>
          <NavLink to="/clients" className={navClass}>
            {t("clients")}
          </NavLink>
          <NavLink to="/cars" className={navClass}>
            {t("cars")}
          </NavLink>
          <NavLink to="/contracts" className={navClass}>
            {t("contracts")}
          </NavLink>
        </nav>
        <span className="lang">
          <button className={lang === "th" ? "on" : ""} onClick={() => setLang("th")}>
            ไทย
          </button>
          <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
            EN
          </button>
        </span>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/new" element={<ClientForm />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/clients/:id/edit" element={<ClientForm />} />
          <Route path="/cars" element={<Cars />} />
          <Route path="/cars/new" element={<CarForm />} />
          <Route path="/cars/:id" element={<CarDetail />} />
          <Route path="/cars/:id/edit" element={<CarForm />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/contracts/new" element={<ContractForm />} />
          <Route path="/contracts/:id" element={<ContractDetail />} />
          <Route path="/contracts/:id/fees/:type" element={<FeeForm />} />
          <Route path="/contracts/:id/late-fees/:kind" element={<LateFees />} />
          <Route path="/installments/:id/pay" element={<PaymentForm />} />
        </Routes>
      </main>
    </>
  );
}
