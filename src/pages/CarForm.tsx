import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import BackButton from "../BackButton";
import DateInput from "../DateInput";
import Modal from "../Modal";
import { useApp } from "../context";
import {
  activeContractForCar,
  addCarEvent,
  createCar,
  getCar,
  setCarStatus,
  updateCar,
  type Car,
  type CarStatus,
} from "../db";
import { isErrorKey } from "../lang";
import { todayIso } from "../money";
import { PROVINCES, joinPlate, splitPlate } from "../provinces";

const STATUSES: CarStatus[] = ["available", "on_contract", "sold", "repossessed"];

/**
 * Adds a record when given onClose, as a dialog over the list; edits one on
 * its own page otherwise.
 */
export default function CarForm({ onClose }: { onClose?: () => void }) {
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
      const mileage = text("mileage")?.replace(/,/g, "") ?? null;
      if (mileage !== null && !/^\d+$/.test(mileage)) throw new Error("err_mileage");
      const fields = {
        brand,
        series: text("series"),
        plate_number: joinPlate(text("plate_number"), text("plate_province")),
        model_year: modelYear === null ? null : Number(modelYear),
        color: text("color"),
        mileage: mileage === null ? null : Number(mileage),
        mileage_unit: text("mileage_unit") === "mi" ? ("mi" as const) : ("km" as const),
        insurance_expires_on: text("insurance_expires_on"),
        // Not on the form; carried through so an edit does not erase what an
        // older version of the form recorded.
        registration_no: car?.registration_no ?? null,
        chassis_no: car?.chassis_no ?? null,
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
        if (changingStatus) {
          await setCarStatus(db, carId, status!);
          // Written in the language in use, like a note typed by hand.
          await addCarEvent(
            db,
            carId,
            todayIso(),
            "status_changed",
            null,
            `${t(car!.status)} → ${t(status!)}`,
          );
        }
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

  const plate = splitPlate(car?.plate_number ?? null);
  const body = (
    <>
      <div className="pagehead">
        {!onClose && <BackButton />}
        <h1>{onClose ? t("add_car") : t("cars")}</h1>
      </div>
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
          {/* The letters and number, then the province from the list: one
              spelling for each province, so plates compare and search alike. */}
          <span className="with-unit plate">
            <input name="plate_number" defaultValue={plate.number} placeholder="กข1234" />
            <select name="plate_province" defaultValue={plate.province}>
              <option value="">{t("province")}</option>
              {PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </span>
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
          {t("mileage")}
          {/* The number and what it counts in, read together as one field. */}
          <span className="with-unit">
            <input
              name="mileage"
              inputMode="numeric"
              defaultValue={car?.mileage != null ? car.mileage.toLocaleString("en-US") : ""}
            />
            <select name="mileage_unit" defaultValue={car?.mileage_unit ?? "km"}>
              <option value="km">{t("km")}</option>
              <option value="mi">{t("mi")}</option>
            </select>
          </span>
        </label>
        <label>
          {t("insurance_expires_on")}
          <DateInput name="insurance_expires_on" defaultValue={car?.insurance_expires_on ?? ""} />
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
        <div className="form-end">
          {onClose && (
            <button type="button" className="ghost" onClick={onClose}>
              {t("cancel")}
            </button>
          )}
          <button type="submit" disabled={busy}>
            {t("save")}
          </button>
        </div>
      </form>
    </>
  );
  return onClose ? <Modal onClose={onClose}>{body}</Modal> : body;
}
