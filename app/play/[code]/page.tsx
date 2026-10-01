import { Phone } from "@/components/phone";

import "../phone.css";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Phone code={code} />;
}
