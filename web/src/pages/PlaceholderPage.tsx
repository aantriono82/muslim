import Container from "../components/Container";
import { Card } from "../components/State";

const PlaceholderPage = ({ title }: { title: string }) => {
  return (
    <div className="py-12">
      <Container>
        <Card>
          <h1 className="text-xl font-semibold text-textPrimary">{title}</h1>
          <p className="mt-2 text-sm text-textSecondary">
            Modul ini masuk ke fase selanjutnya. Kami sedang menyiapkan pengalaman terbaik agar sesuai
            blueprint aplikasi.
          </p>
        </Card>
      </Container>
    </div>
  );
};

export default PlaceholderPage;
