'use client';

import { PageHeader } from '@/components/ui/page-header';
import { RequireWallet } from '@/components/ui/require-wallet';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useCallback } from 'react';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { actionCreators } from '@near-js/transactions';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ProjectCard } from './components/ProjectCard';
import { CreateProjectForm } from './components/CreateProjectForm';
import { AddVersionForm } from './components/AddVersionForm';
import { ProjectView, VersionView, CreateProjectFormData, AddVersionFormData } from './components/types';
import { getCoordinatorApiUrl } from '@/lib/api';

export default function ProjectsPage() {
  const { accountId, isConnected, signAndSendTransaction, contractId, viewMethod, network } = useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);

  // Projects list
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [projectVersions, setProjectVersions] = useState<Record<string, VersionView[]>>({});
  const [versionCounts, setVersionCounts] = useState<Record<string, number>>({});
  const [projectStorage, setProjectStorage] = useState<Record<string, { total_bytes: number; key_count: number }>>({});
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingVersionsFor, setLoadingVersionsFor] = useState<string | null>(null);

  // UI state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [addVersionForProject, setAddVersionForProject] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Messages
  const [error, setError] = useState<string | null>(null);
  /** A removal said in words before the wallet opens; its button sends the transaction. */
  const [confirming, setConfirming] = useState<
    { kind: 'version'; project: string; version: string } | { kind: 'project'; project: string } | null
  >(null);
  const [sending, setSending] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load user's projects
  const loadProjects = useCallback(async () => {
    if (!accountId) return;

    setLoadingProjects(true);
    try {
      const result = await viewMethod({
        contractId,
        method: 'list_user_projects',
        args: { account_id: accountId },
      });

      const projectList = Array.isArray(result) ? result as ProjectView[] : [];
      setProjects(projectList);

      // Load version counts and secrets storage for all projects
      const counts: Record<string, number> = {};
      const storage: Record<string, { total_bytes: number; key_count: number }> = {};
      await Promise.all(
        projectList.map(async (project) => {
          // Load version count
          try {
            const count = await viewMethod({
              contractId,
              method: 'get_version_count',
              args: { project_id: project.project_id },
            });
            counts[project.project_id] = typeof count === 'number' ? count : 0;
          } catch {
            counts[project.project_id] = 0;
          }
          // Load persistent storage size from coordinator API
          try {
            const res = await fetch(
              `${coordinatorUrl}/public/projects/storage?project_uuid=${encodeURIComponent(project.uuid)}`
            );
            if (res.ok) {
              const data = await res.json();
              storage[project.project_id] = {
                total_bytes: data.total_bytes || 0,
                key_count: data.key_count || 0,
              };
            }
          } catch {
            // Ignore errors - storage info is optional
          }
        })
      );
      setVersionCounts(counts);
      setProjectStorage(storage);
    } catch (err) {
      console.error('Failed to load projects:', err);
      setError(`Failed to load projects: ${(err as Error).message}`);
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, [accountId, contractId, viewMethod, coordinatorUrl]);

  // Load versions for a project with pagination
  const loadVersions = useCallback(async (projectId: string, _projectUuid: string) => {
    setLoadingVersionsFor(projectId);
    try {
      const PAGE_SIZE = 50;
      let allVersions: VersionView[] = [];
      let offset = 0;

      // Contract returns wasm_hash, we map it to version_key
      interface ContractVersionView {
        wasm_hash: string;
        source: VersionView['source'];
        added_at: number;
        is_active: boolean;
      }

      // Fetch pages until we get less than PAGE_SIZE results
      while (true) {
        const batch = await viewMethod({
          contractId,
          method: 'list_versions',
          args: { project_id: projectId, from_index: offset, limit: PAGE_SIZE },
        }) as ContractVersionView[] | null;

        const rawVersions = Array.isArray(batch) ? batch : [];
        // Map wasm_hash to version_key
        const versions: VersionView[] = rawVersions.map(v => ({
          version_key: v.wasm_hash,
          source: v.source,
          added_at: v.added_at,
          is_active: v.is_active,
        }));
        allVersions = [...allVersions, ...versions];

        // If we got less than PAGE_SIZE, we're done
        if (versions.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      setProjectVersions(prev => ({
        ...prev,
        [projectId]: allVersions,
      }));
    } catch (err) {
      console.error('Failed to load versions:', err);
      setProjectVersions(prev => ({
        ...prev,
        [projectId]: [],
      }));
    } finally {
      setLoadingVersionsFor(null);
    }
  }, [contractId, viewMethod]);


  // Load projects when connected
  useEffect(() => {
    if (isConnected && accountId) {
      loadProjects();
    }
  }, [isConnected, accountId, loadProjects]);

  // Load versions when project is expanded
  useEffect(() => {
    if (expandedProject && !projectVersions[expandedProject]) {
      const project = projects.find(p => p.project_id === expandedProject);
      if (project) {
        loadVersions(expandedProject, project.uuid);
      }
    }
  }, [expandedProject, projects, projectVersions, loadVersions]);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Create project handler
  const handleCreateProject = async (formData: CreateProjectFormData) => {
    setIsSubmitting(true);
    try {
      const source = { WasmUrl: { url: formData.wasmUrl, hash: formData.wasmHash, build_target: formData.buildTarget || null } };

      const args = {
        name: formData.name,
        source,
      };

      // Estimate deposit needed (project base + version)
      // Using 0.01 NEAR as a safe estimate
      const depositEstimate = '10000000000000000000000'; // 0.01 NEAR

      const action = actionCreators.functionCall(
        'create_project',
        args,
        BigInt('100000000000000'), // 100 TGas
        BigInt(depositEstimate)
      );

      await signAndSendTransaction({
        receiverId: contractId,
        actions: [action],
      });

      setSuccess('Project created successfully!');
      setShowCreateForm(false);
      setTimeout(() => loadProjects(), 3000);
    } catch (err) {
      setError(`Failed to create project: ${(err as Error).message}`);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add version handler
  const handleAddVersion = async (formData: AddVersionFormData) => {
    setIsSubmitting(true);
    try {
      const source = { WasmUrl: { url: formData.wasmUrl, hash: formData.wasmHash, build_target: formData.buildTarget || null } };

      const args = {
        project_name: formData.projectName,
        source,
        set_active: formData.setActive,
      };

      const depositEstimate = '5000000000000000000000'; // 0.005 NEAR

      const action = actionCreators.functionCall(
        'add_version',
        args,
        BigInt('100000000000000'), // 100 TGas
        BigInt(depositEstimate)
      );

      await signAndSendTransaction({
        receiverId: contractId,
        actions: [action],
      });

      setSuccess('Version added successfully!');
      setAddVersionForProject(null);

      // Reload versions for this project
      const projectId = `${accountId}/${formData.projectName}`;
      const project = projects.find(p => p.project_id === projectId);
      if (project) {
        setTimeout(() => loadVersions(projectId, project.uuid), 3000);
      }
    } catch (err) {
      setError(`Failed to add version: ${(err as Error).message}`);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Set active version handler
  const handleSetActiveVersion = async (projectName: string, versionKey: string) => {
    try {
      const action = actionCreators.functionCall(
        'set_active_version',
        { project_name: projectName, version_key: versionKey },
        BigInt('30000000000000'), // 30 TGas
        BigInt('0')
      );

      await signAndSendTransaction({
        receiverId: contractId,
        actions: [action],
      });

      setSuccess('Active version updated!');
      setTimeout(() => loadProjects(), 2000);
    } catch (err) {
      setError(`Failed to set active version: ${(err as Error).message}`);
    }
  };

  // Remove version handler
  const handleRemoveVersion = async (projectName: string, versionKey: string) => {
    const action = actionCreators.functionCall(
      'remove_version',
      { project_name: projectName, version_key: versionKey },
      BigInt('30000000000000'), // 30 TGas
      BigInt('0')
    );

    await signAndSendTransaction({
      receiverId: contractId,
      actions: [action],
    });

    setSuccess('Version removed! Storage deposit refunded.');
    const projectId = `${accountId}/${projectName}`;
    const project = projects.find(p => p.project_id === projectId);
    if (project) {
      setTimeout(() => loadVersions(projectId, project.uuid), 2000);
    }
  };

  // Delete project handler
  const handleDeleteProject = async (projectName: string) => {
    const action = actionCreators.functionCall(
      'delete_project',
      { project_name: projectName },
      BigInt('50000000000000'), // 50 TGas
      BigInt('0')
    );

    await signAndSendTransaction({
      receiverId: contractId,
      actions: [action],
    });

    setSuccess('Project deleted! Storage deposit refunded.');
    setTimeout(() => loadProjects(), 2000);
  };

  // The wallet opens from the click on the dialog's button, with nothing
  // awaited before it; a browser dialog in front of it would spend that click.
  const sendConfirmed = async () => {
    if (!confirming) return;
    setSending(true);
    setConfirmError(null);
    try {
      if (confirming.kind === 'version') await handleRemoveVersion(confirming.project, confirming.version);
      else await handleDeleteProject(confirming.project);
      setConfirming(null);
    } catch (err) {
      setConfirmError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
 <div className="w-full">
      {confirming && (
        <ConfirmDialog
          title={confirming.kind === 'version' ? 'Remove this version?' : `Delete project “${confirming.project}”?`}
          action={confirming.kind === 'version' ? 'Sign: remove the version' : 'Sign: delete the project'}
          destructive
          busy={sending}
          error={confirmError}
          onConfirm={sendConfirmed}
          onClose={() => {
            setConfirming(null);
            setConfirmError(null);
          }}
        >
          {confirming.kind === 'version' ? (
            <p>
              Version <code className="break-all font-mono text-xs">{confirming.version}</code> of {confirming.project} is
              removed from the contract, and its storage deposit comes back to your account. This cannot be undone.
            </p>
          ) : (
            <p>
              The project and every version of it are removed from the contract, and the storage deposit comes back to
              your account. This cannot be undone.
            </p>
          )}
        </ConfirmDialog>
      )}
      {/* Header */}
      <PageHeader
        title="Projects"
        description="Manage your OutLayer projects with persistent storage across versions."
        action={
          isConnected ? (
            <Button onClick={() => setShowCreateForm(true)}>New project</Button>
          ) : undefined
        }
      />

      {!isConnected && (
        <div className="mb-6 mt-6">
          <RequireWallet subject="your projects" />
        </div>
      )}


      {/* Error Display */}
      {error && (
 <div className="mt-4 bg-destructive/10 border border-destructive/30 rounded-md p-3">
 <p className="text-sm text-destructive-text">{error}</p>
        </div>
      )}

      {/* Success Display */}
      {success && (
 <div className="mt-4 bg-success/10 border border-success/30 rounded-md p-3">
 <p className="text-sm text-success-text">{success}</p>
        </div>
      )}

      {/* Create Project Form */}
      {showCreateForm && (
 <div className="mt-6">
          <CreateProjectForm
            onSubmit={handleCreateProject}
            onCancel={() => setShowCreateForm(false)}
            isSubmitting={isSubmitting}
          />
        </div>
      )}

      {/* Projects List */}
      {isConnected && (
 <div className="mt-8">
          {loadingProjects ? (
 <div className="flex items-center justify-center py-12">
 <svg className="animate-spin h-8 w-8 text-accent-text" fill="none" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
 <span className="ml-3 text-muted-foreground">Loading projects...</span>
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              className="max-w-3xl"
              title="No projects yet"
              description="A project is a named home for your code: versions, secrets and persistent storage that survives updates."
              action={
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg text-on-accent bg-accent hover:bg-accent-hover cursor-pointer"
                >
                  Create project
                </button>
              }
            />
          ) : (
 <div className="space-y-4">
              {projects.map((project) => (
                <div key={project.project_id}>
                  <ProjectCard
                    project={project}
                    versions={projectVersions[project.project_id] || []}
                    versionCount={versionCounts[project.project_id] || 0}
                    projectStorage={projectStorage[project.project_id]}
                    loadingVersions={loadingVersionsFor === project.project_id}
                    expanded={expandedProject === project.project_id}
                    onToggleExpand={() => setExpandedProject(
                      expandedProject === project.project_id ? null : project.project_id
                    )}
                    onAddVersion={() => setAddVersionForProject(project.name)}
                    onSetActiveVersion={(wasmHash) => handleSetActiveVersion(project.name, wasmHash)}
                    onRemoveVersion={(versionKey) => setConfirming({ kind: 'version', project: project.name, version: versionKey })}
                    onDeleteProject={() => setConfirming({ kind: 'project', project: project.name })}
                  />
                  {addVersionForProject === project.name && (
 <div className="mt-2">
                      <AddVersionForm
                        projectName={addVersionForProject}
                        onSubmit={handleAddVersion}
                        onCancel={() => setAddVersionForProject(null)}
                        isSubmitting={isSubmitting}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Refresh Button */}
          {projects.length > 0 && (
 <div className="mt-4">
              <button
                onClick={loadProjects}
 className="text-sm text-muted-foreground hover:text-accent-text flex items-center"
              >
 <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          )}
        </div>
      )}

      {/* Info Section */}
 <div className="mt-8 max-w-3xl bg-card-muted border border-border rounded-lg p-6">
 <h3 className="text-sm font-semibold text-foreground mb-3">
          About Projects
        </h3>
 <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
          <li>
 <strong>Persistent Storage</strong>: Data persists across version updates within a project
          </li>
          <li>
 <strong>Version Management</strong>: Add multiple versions, switch active version anytime
          </li>
          <li>
 <strong>Project Secrets</strong>: Store secrets for the whole project (not per-version)
          </li>
          <li>
 <strong>Storage Deposit</strong>: Pay for on-chain storage, refunded when deleted
          </li>
        </ul>

 <div className="mt-4 p-3 bg-card rounded border border-info/30">
 <h4 className="text-xs font-semibold text-foreground mb-2">Project ID Format</h4>
 <code className="text-xs text-accent-text font-mono">
            {accountId || 'yourname.near'}/project-name
          </code>
        </div>
      </div>
    </div>
  );
}
