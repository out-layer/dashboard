'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { actionCreators } from '@near-js/transactions';
import WalletConnectionModal from '@/components/WalletConnectionModal';
import { EmptyState } from '@/components/ui/empty-state';
import { ProjectCard } from './components/ProjectCard';
import { CreateProjectForm } from './components/CreateProjectForm';
import { AddVersionForm } from './components/AddVersionForm';
import { ProjectView, VersionView, CreateProjectFormData, AddVersionFormData, normalizeRepoUrl } from './components/types';
import { getCoordinatorApiUrl } from '@/lib/api';

export default function ProjectsPage() {
  const { accountId, isConnected, signAndSendTransaction, contractId, viewMethod, shouldReopenModal, clearReopenModal, network } = useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);

  // Projects list
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [projectVersions, setProjectVersions] = useState<Record<string, VersionView[]>>({});
  const [versionCounts, setVersionCounts] = useState<Record<string, number>>({});
  const [projectStorage, setProjectStorage] = useState<Record<string, { total_bytes: number; key_count: number }>>({});
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingVersionsFor, setLoadingVersionsFor] = useState<string | null>(null);

  // UI state
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [addVersionForProject, setAddVersionForProject] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Messages
  const [error, setError] = useState<string | null>(null);
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

  // Auto-open modal if we switched networks
  useEffect(() => {
    if (shouldReopenModal && !isConnected) {
      setShowWalletModal(true);
      clearReopenModal();
    }
  }, [shouldReopenModal, isConnected, clearReopenModal]);

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
      // Normalize repo URL to consistent format (e.g., git@github.com:owner/repo.git -> github.com/owner/repo)
      const normalizedRepo = formData.sourceType === 'github' ? normalizeRepoUrl(formData.repo) : '';
      const source = formData.sourceType === 'github'
        ? { GitHub: { repo: normalizedRepo, commit: formData.commit, build_target: formData.buildTarget || null } }
        : { WasmUrl: { url: formData.wasmUrl, hash: formData.wasmHash, build_target: formData.buildTarget || null } };

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

      setSuccess('Project created successfully! Worker is compiling your code...');
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
      // Normalize repo URL to consistent format
      const normalizedRepo = formData.sourceType === 'github' ? normalizeRepoUrl(formData.repo) : '';
      const source = formData.sourceType === 'github'
        ? { GitHub: { repo: normalizedRepo, commit: formData.commit, build_target: formData.buildTarget || null } }
        : { WasmUrl: { url: formData.wasmUrl, hash: formData.wasmHash, build_target: formData.buildTarget || null } };

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
    if (!confirm(`Remove version "${versionKey}"? This cannot be undone.`)) {
      return;
    }

    try {
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
    } catch (err) {
      setError(`Failed to remove version: ${(err as Error).message}`);
    }
  };

  // Delete project handler
  const handleDeleteProject = async (projectName: string) => {
    if (!confirm(`Delete project "${projectName}"? This will remove all versions and cannot be undone.`)) {
      return;
    }

    try {
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
    } catch (err) {
      setError(`Failed to delete project: ${(err as Error).message}`);
    }
  };

  return (
 <div className="w-full">
      {/* Header */}
 <div className="sm:flex sm:items-center sm:justify-between">
        <div>
 <h1 className="text-xl font-bold tracking-tight">Projects</h1>
 <p className="mt-1 text-sm text-muted-foreground">
            Manage your OutLayer projects with persistent storage across versions
          </p>
        </div>
        {isConnected && (
 <div className="mt-4 sm:mt-0">
            <button
              onClick={() => setShowCreateForm(true)}
 className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-on-accent bg-accent hover:bg-accent-hover shadow-sm"
            >
 <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
          </div>
        )}
      </div>

      {/* Connect Wallet Button */}
      {!isConnected && (
 <div className="mt-8">
          <button
            onClick={() => setShowWalletModal(true)}
 className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-on-accent bg-accent hover:bg-accent-hover shadow-sm hover:shadow-md transition-all"
          >
            Connect Wallet
          </button>
        </div>
      )}

      {/* Wallet Modal */}
      <WalletConnectionModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
      />

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
                    onRemoveVersion={(wasmHash) => handleRemoveVersion(project.name, wasmHash)}
                    onDeleteProject={() => handleDeleteProject(project.name)}
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
