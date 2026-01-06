use std::collections::HashMap;

#[derive(Clone)]
pub struct File {
    pub content: String, // WICHTIG: Das Feld muss auch public sein
}

#[derive(Clone)]
pub struct Directory {
    pub subdirs: HashMap<String, Directory>, // WICHTIG: pub
    pub files: HashMap<String, File>,        // WICHTIG: pub
}

impl Directory {
    pub fn new() -> Self {
        Directory {
            subdirs: HashMap::new(),
            files: HashMap::new(),
        }
    }
}