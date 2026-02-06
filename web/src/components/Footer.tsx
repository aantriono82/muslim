import { Link } from "react-router-dom";
import Container from "./Container";

const Footer = () => {
  return (
    <footer className="safe-bottom border-t border-emerald-100 bg-white/90 pb-24 pt-10 lg:pb-10">
      <Container>
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-textPrimary">
              Tentang
            </h3>
            <p className="mt-2 text-sm text-textSecondary">
              <span className="font-semibold text-textPrimary">MuslimKit</span>{" "}
              adalah Toolkit Muslim harian untuk kebutuhan ibadah umat.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-textPrimary">
              Kontak
            </h4>
            <p className="mt-3 text-sm text-textSecondary">
              Silakan hubungi kontak admin : aantriono82@gmail.com
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-textPrimary">
              Informasi
            </h4>
            <p className="mt-3 text-sm text-textSecondary">
              Gunakan informasi sebagai referensi. Baca{" "}
              <Link to="/disclaimer" className="font-semibold text-emerald-700">
                Disclaimer
              </Link>
              .
            </p>
          </div>
        </div>
      </Container>
    </footer>
  );
};

export default Footer;
