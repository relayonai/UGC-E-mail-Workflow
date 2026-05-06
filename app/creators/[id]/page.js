import CreatorDetailPage from "../../../components/CreatorDetailPage";

export default async function Page({ params }) {
  const { id } = await params;
  return <CreatorDetailPage creatorId={id} />;
}
