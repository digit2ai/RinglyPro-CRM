import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getProject, getRecommendations } from '../lib/api'
import ProductCard from '../components/ProductCard'

export default function ProductsPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()

  const [project, setProject] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
  }, [projectId])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [proj, recs] = await Promise.all([
        getProject(projectId),
        getRecommendations(projectId)
      ])
      setProject(proj)
      const recsArray = recs?.recommendations || recs || []
      setRecommendations(Array.isArray(recsArray) ? recsArray : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <svg className="animate-spin w-12 h-12 text-pinaxis-500 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-slate-400 text-lg">Loading product recommendations...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <div className="card text-center">
          <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <h3 className="text-xl font-semibold text-white mb-2">Error Loading Recommendations</h3>
          <p className="text-slate-400 mb-6">{error}</p>
          <div className="flex justify-center gap-3">
            <button onClick={loadData} className="btn-primary">Retry</button>
            <button onClick={() => navigate(`/analysis/${projectId}`)} className="btn-secondary">
              Back to Analysis
            </button>
          </div>
        </div>
      </div>
    )
  }

  const topRecommendation = recommendations.length > 0 ? recommendations[0] : null
  const otherRecommendations = recommendations.slice(1)

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Product Recommendations</h1>
          <p className="text-slate-400">
            GEBHARDT product matching results for {project?.company_name || 'your warehouse'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to={`/analysis/${projectId}`}
            className="btn-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Analysis
          </Link>
          <Link
            to={`/report/${projectId}`}
            className="btn-primary flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            Generate Report
          </Link>
        </div>
      </div>

      {/* Summary Banner */}
      {recommendations.length > 0 && (
        <div className="card mb-8 bg-gradient-to-r from-pinaxis-900/40 to-slate-800 border-pinaxis-700/40">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-pinaxis-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {recommendations.length} Product{recommendations.length !== 1 ? 's' : ''} Matched
              </h3>
              <p className="text-sm text-slate-400">
                Based on your warehouse data analysis, we recommend the following GEBHARDT intralogistics solutions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Recommendation */}
      {topRecommendation && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <h2 className="text-xl font-semibold text-white">Top Recommendation</h2>
          </div>
          <ProductCard product={topRecommendation} isTopPick />
        </div>
      )}

      {/* Other Recommendations */}
      {otherRecommendations.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">Additional Products</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {otherRecommendations.map((product, index) => (
              <ProductCard key={product.id || index} product={product} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {recommendations.length === 0 && (
        <div className="card text-center py-16">
          <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
          <h3 className="text-xl font-semibold text-white mb-2">No Recommendations Yet</h3>
          <p className="text-slate-400 mb-6">
            Product matching has not been completed for this project.
          </p>
          <Link to={`/analysis/${projectId}`} className="btn-primary">
            Back to Analysis
          </Link>
        </div>
      )}
    </div>
  )
}
