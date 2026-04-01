interface PageWrapperProps {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

const PageWrapper = ({ title, description, actions, children }: PageWrapperProps) => (
  <div className="flex flex-col flex-1 min-h-0">

    {/* Page header */}
    <div className="flex items-start justify-between px-6 py-5 border-b border-slate-200 bg-white shrink-0">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {description && (
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 ml-4">
          {actions}
        </div>
      )}
    </div>

    {/* Page content */}
    <div className="flex-1 overflow-auto p-6">
      {children}
    </div>

  </div>
)

export default PageWrapper