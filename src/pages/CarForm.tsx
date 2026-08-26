import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import BackButton from "../BackButton";
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

    setError(null);
    setBusy(true);
    try {
      const brand = text("brand");
      if (!brand) throw new Error("err_brand_required");
      const modelYear = text("model_year");
      const fields = {
        brand,
        series: text("series"),
        plate_number: text("plate_number"),
        model_year: modelYear === null ? null : Number(modelYear),
        color: text("color"),
        // Not on the form; carried through so an edit does not erase what an
        // older version of the form recorded.
        registration_no: car?.registration_no ?? null,
        chassis_no: car?.chassis_no ?? null,
        mileage: car?.mileage ?? null,
        cost_price: car?.cost_price ?? null,
        asking_price: car?.asking_price ?? null,
        note: car?.note ?? null,
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
      <BackButton />
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
          {t("plate_number")}
          <input name="plate_number" defaultValue={car?.plate_number ?? ""} />
        </label>
        <label>
          {t("model_year")}
          <input name="model_year" type="number" defaultValue={car?.model_year ?? ""} />
        </label>
        <label>
          {t("color")}
          <input name="color" defaultValue={car?.color ?? ""} />
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
