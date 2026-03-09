import React from 'react'

export default function OEEDashboardPage() {
  return (
    <div className="w-full h-[calc(100vh-80px)] -m-4 sm:-m-6 lg:-m-8">
      <iframe
        src="/oee-dashboard/index.html"
        className="w-full h-full border-0"
        title="OEE Dashboard"
      />
    </div>
  )
}
