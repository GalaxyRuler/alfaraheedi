use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;
use write_core::Language;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DictionaryManifest {
    pub id: String,
    pub language: Language,
    pub dic_path: PathBuf,
    pub aff_path: Option<PathBuf>,
    pub license: Option<String>,
    pub source_url: Option<String>,
}

impl DictionaryManifest {
    pub fn validate_paths(&self, root: &Path) -> Result<(), DictionaryManifestError> {
        let dic_path = root.join(&self.dic_path);
        if !dic_path.is_file() {
            return Err(DictionaryManifestError::MissingDictionaryFile(dic_path));
        }

        if let Some(aff_path) = &self.aff_path {
            let aff_path = root.join(aff_path);
            if !aff_path.is_file() {
                return Err(DictionaryManifestError::MissingAffixFile(aff_path));
            }
        }

        Ok(())
    }
}

#[derive(Debug, Error)]
pub enum DictionaryManifestError {
    #[error("dictionary file does not exist: {0}")]
    MissingDictionaryFile(PathBuf),
    #[error("affix file does not exist: {0}")]
    MissingAffixFile(PathBuf),
}

#[derive(Debug, Clone, Default)]
pub struct DictionaryRegistry {
    manifests: Vec<DictionaryManifest>,
}

impl DictionaryRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, manifest: DictionaryManifest) {
        self.manifests.push(manifest);
    }

    pub fn manifests(&self) -> &[DictionaryManifest] {
        &self.manifests
    }

    pub fn for_language(&self, language: Language) -> impl Iterator<Item = &DictionaryManifest> {
        self.manifests
            .iter()
            .filter(move |manifest| manifest.language == language)
    }
}
