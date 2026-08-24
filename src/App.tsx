import { Link, Route, Routes } from "react-router-dom";

import { useApp } from "./context";
import CarDetail from "./pages/CarDetail";
import CarForm from "./pages/CarForm";
import Cars from "./pages/Cars";
import ClientDetail from "./pages/ClientDetail";
import ClientForm from "./pages/ClientForm";
import Clients from "./pages/Clients";
import ContractForm from "./pages/ContractForm";
import Contracts from "./pages/Contracts";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const { t, setLang } = useApp();

  return (
    <>
      <header>
        <Link className="brand" to="/">
          {t("app_name")}
        </Link>
        <nav>
          <Link to="/">{t("dashboard")}</Link>
          <Link to="/clients">{t("clients")}</Link>
          <Link to="/cars">{t("cars")}</Link>
          <Link to="/contracts">{t("contracts")}</Link>
        </nav>
        <span className="lang">
          <button onClick={() => setLang("th")}>ไทย</button>
          <button onClick={() => setLang("en")}>EN</button>
        </span>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
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
        </Routes>
      </main>
    </>
  );
}
