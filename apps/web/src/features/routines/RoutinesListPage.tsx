import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { routinesApi } from '@/api/routines'
import { Layout } from '@/components/Layout'
import { Button, Field, ErrorText, Spinner } from '@/components/ui'
import { ApiError } from '@/api/client'

export function RoutinesListPage() {
  const qc = useQueryClient()
  const { data: routines, isLoading, isError } = useQuery({
    queryKey: ['routines'],
    queryFn: routinesApi.list,
  })

  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const createMut = useMutation({
    mutationFn: (n: string) => routinesApi.create(n),
    onSuccess: () => {
      setName('')
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

  return (
    <Layout title="Workout Days">
      <form className="card stack" onSubmit={onCreate}>
        <Field
          label="New workout day"
          name="name"
          placeholder="Push Day"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="primary" disabled={createMut.isPending}>
          {createMut.isPending ? 'Adding…' : 'Add workout day'}
        </Button>
      </form>

      {isLoading ? <Spinner /> : null}
      {isError ? <ErrorText>Could not load your routines.</ErrorText> : null}

      {routines && routines.length === 0 ? (
        <p className="muted center">No workout days yet. Create your first above.</p>
      ) : null}

      <ul className="list">
        {routines?.map((r) => (
          <li key={r.id} className="list-item">
            <div className="row-between">
              <Link to={`/routines/${r.id}`} className="grow" style={{ textDecoration: 'none', color: 'inherit' }}>
                <strong>{r.name}</strong>
                {r.notes ? <div className="small muted">{r.notes}</div> : null}
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
    </Layout>
  )
}
