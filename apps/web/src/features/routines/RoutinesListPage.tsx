import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { routinesApi } from '@/api/routines'
import { Layout } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Button, Field, ErrorText, Spinner } from '@/components/ui'
import { ChevronRight, PlusIcon } from '@/components/icons'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/api/client'

export function RoutinesListPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { data: routines, isLoading, isError } = useQuery({
    queryKey: ['routines'],
    queryFn: routinesApi.list,
  })

  const [sheetOpen, setSheetOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const openSheet = () => {
    setName('')
    setError('')
    setSheetOpen(true)
  }

  const createMut = useMutation({
    mutationFn: (n: string) => routinesApi.create(n),
    onSuccess: () => {
      setName('')
      setSheetOpen(false)
      qc.invalidateQueries({ queryKey: ['routines'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not create'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => routinesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routines'] }),
  })

  function onCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return
    createMut.mutate(name.trim())
  }

  const firstName = (user?.display_name || '').trim().split(/\s+/)[0]

  const intro = (
    <div className="page-intro">
      <h2>{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h2>
      <p>Pick a workout day to get training.</p>
    </div>
  )

  const addAction = (
    <button type="button" className="icon-btn" aria-label="New workout day" onClick={openSheet}>
      <PlusIcon />
    </button>
  )

  return (
    <Layout title="Workouts" intro={intro} action={addAction}>
      {isLoading ? <Spinner /> : null}
      {isError ? <ErrorText>Could not load your routines.</ErrorText> : null}

      {routines && routines.length > 0 ? (
        <>
          <div className="section-label">Your workout days</div>
          <ul className="list">
            {routines.map((r) => (
              <li key={r.id} className="list-item">
                <div className="row-between">
                  <Link
                    to={`/routines/${r.id}`}
                    className="row grow"
                    style={{ color: 'inherit', minWidth: 0 }}
                  >
                    <div className="grow">
                      <div className="row-title">{r.name}</div>
                      {r.notes ? <div className="row-sub">{r.notes}</div> : null}
                    </div>
                    <ChevronRight className="chevron" />
                  </Link>
                  <Button
                    size="sm"
                    variant="danger"
                    aria-label={`Delete ${r.name}`}
                    onClick={() => {
                      if (confirm(`Delete "${r.name}"? Past sessions are kept.`)) deleteMut.mutate(r.id)
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {routines && routines.length === 0 ? (
        <div className="empty">
          <span className="emoji">🏋️</span>
          No workout days yet.
          <div className="small" style={{ marginTop: 'var(--sp-4)' }}>
            <Button variant="primary" onClick={openSheet}>Create workout day</Button>
          </div>
        </div>
      ) : null}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="New workout day">
        <form className="stack" onSubmit={onCreate}>
          <Field
            label="Workout day name"
            name="name"
            placeholder="Push Day"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" block disabled={createMut.isPending}>
            {createMut.isPending ? 'Adding…' : 'Add workout day'}
          </Button>
        </form>
      </Sheet>
    </Layout>
  )
}
