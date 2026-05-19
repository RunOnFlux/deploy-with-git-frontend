import OrbitSpinner from './OrbitSpinner';

export default function GlobeLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="spinner-color">
        <OrbitSpinner size={72} />
      </div>
    </div>
  );
}
