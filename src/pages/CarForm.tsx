import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useApp } from "../context";
import {
  activeContractForCar,
  createCar,
  getCar,
  setCarStatus,
  updateCar,
  type Car,
  type CarStatus,
} from "../db";
import { isErrorKey } from "../lang";
import { formatBaht, toSatang } from "../money";

const STATUSES: CarStatus[] = ["available", "on_contract", "sold", "repossessed"];

export default function CarForm() {
  const { db, t } = useApp();
  const navigate = useNavigate();
  const { id } = useParams();
  const carId = id ? Number(id) : null;

  const [car, setCar] = useState<Car | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (carId) getCar(db, carId).then((c) => setCar(c ?? null));
  }, [db, carId]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => ((form.get(key) as string) ?? "").trim() || null;
    const number = (key: string) => {
      const value = text(key);
      return value === null ? null : Number(value);
    };
    const satang = (key: string) => {
      const value = text(key);
      return value === null ? null : toSatang(value);
    };

    setError(null);
    setBusy(true);
    try {
      const brand = text("brand");
      if (!brand) throw new Error("err_brand_required");
      const fields = {
        brand,
        series: text("series"),
        model_year: number("model_year"),
        color: text("color"),
        plate_number: text("plate_number"),
        registration_no: text("registration_no"),
        chassis_no: text("chassis_no"),
        mileage: number("mileage"),
        cost_price: satang("cost_price"),
        asking_price: satang("asking_price"),
        note: text("note"),
      };
      if (carId) {
        // While a contract is running, the contract page owns the car's
        // status. Letting staff set it back to available here would let a
        // second contract be written against the same car.
        const status = text("status") as CarStatus | null;
        const changingStatus = !!status && status !== car?.status;
        if (changingStatus && (await activeContractForCar(db, carId))) {
          throw new Error("err_car_has_active_contract");
        }
        await updateCar(db, carId, fields);
        if (changingStatus) await setCarStatus(db, carId, status!);
        navigate(`/cars/${carId}`);
      } else {
        navigate(`/cars/${await createCar(db, fields)}`);
      }
    } catch (e) {
      const message = String(e);
      setError(
        message.includes("UNIQUE")
          ? t("err_plate_taken")
          : e instanceof Error && isErrorKey(e.message)
            ? t(e.message)
            : message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>{t("cars")}</h1>
      {error && <p className="flash">{error}</p>}
      <form className="stack" key={car?.id ?? "new"} onSubmit={onSubmit}>
        <label>
          {t("brand")}
          <input name="brand" defaultValue={car?.brand ?? ""} required />
        </label>
        <label>
          {t("series")}
          <input name="series" defaultValue={car?.series ?? ""} />
        </label>
        <label>
          {t("model_year")}
          <input name="model_year" type="number" defaultValue={car?.model_year ?? ""} />
        </label>
        <label>
          {t("color")}
          <input name="color" defaultValue={car?.color ?? ""} />
        </label>
        <label>
          {t("plate_number")}
          <input name="plate_number" defaultValue={car?.plate_number ?? ""} />
        </label>
        <label>
          {t("registration_no")}
          <input name="registration_no" defaultValue={car?.registration_no ?? ""} />
        </label>
        <label>
          {t("chassis_no")}
          <input name="chassis_no" defaultValue={car?.chassis_no ?? ""} />
        </label>
        <label>
          {t("mileage")}
          <input name="mileage" type="number" defaultValue={car?.mileage ?? ""} />
        </label>
        <label>
          {t("cost_price")}
          <input
            name="cost_price"
            defaultValue={car?.cost_price != null ? formatBaht(car.cost_price) : ""}
          />
        </label>
        <label>
          {t("asking_price")}
          <input
            name="asking_price"
            defaultValue={car?.asking_price != null ? formatBaht(car.asking_price) : ""}
          />
        </label>
        <label>
          {t("note")}
          <textarea name="note" rows={2} defaultValue={car?.note ?? ""} />
        </label>
        {car && (
          <label>
            {t("status")}
            <select name="status" defaultValue={car.status}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(s)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div>
          <button type="submit" disabled={busy}>
            {t("save")}
          </button>
        </div>
      </form>
    </>
  );
}
