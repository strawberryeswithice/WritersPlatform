import LandingPage from './pages/LandingPage.jsx';
import CatalogPage from './pages/CatalogPage.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import EditorPage from './pages/EditorPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import TrashPage from './pages/TrashPage.jsx';
import Notifications from './components/Notifications.jsx';

function getPage() {
  const path = window.location.pathname;
  if (path.match(/^\/editor\/\d+\/\d+/)) return 'editor';
  if (path.match(/^\/project\/\d+/)) return 'project';
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/trash')) return 'trash';
  if (path.startsWith('/catalog')) return 'catalog';
  return 'landing';
}

export default function App() {
  const page = getPage();
  return (
    <>
      <Notifications />
      {page === 'landing'  && <LandingPage />}
      {page === 'catalog'  && <CatalogPage />}
      {page === 'project'  && <ProjectPage />}
      {page === 'editor'   && <EditorPage />}
      {page === 'admin'    && <AdminPage />}
      {page === 'trash'    && <TrashPage />}
    </>
  );
}
