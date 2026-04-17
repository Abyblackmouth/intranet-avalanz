interface PageWrapperProps {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

const PageWrapper = ({ title, description, actions, children }: PageWrapperProps) => (
  <div className="flex flex-col flex-1 min-h-0">
    <div className="flex items-center justify-between px-6 py-5 shrink-0">
      <div>
        <h1 className="text-xl font-semibold text-slate-800" style={{ fontFamily: "var(--font-jakarta)" }}>{title}</h1>
        {description && (
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 ml-4">
          {actions}
        </div>
      )}
    </div>
    <div className="flex-1 overflow-auto px-6 pb-6">
      {children}
    </div>
  </div>
)

export default PageWrapper