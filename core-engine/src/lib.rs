use wasm_bindgen::prelude::*;
extern crate console_error_panic_hook;
use std::panic;

// Speicher-Manager Fix
extern crate wee_alloc;
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

mod filesystem;
mod crypto;

use filesystem::{Directory, File};
// Wir exportieren CryptoEngine jetzt direkt für JS!
pub use crypto::CryptoEngine;

// --- 1. DAS DATEISYSTEM (Getrennt) ---
#[wasm_bindgen]
pub struct TerminalSystem {
    root: Directory,
    current_path: Vec<String>,
    user: String,
    // KEIN CRYPTO MEHR HIER DRIN!
}

#[wasm_bindgen]
impl TerminalSystem {
    pub fn new() -> TerminalSystem {
        panic::set_hook(Box::new(console_error_panic_hook::hook));

        let mut root = Directory::new();
        let mut home = Directory::new();
        let mut kali = Directory::new();

        kali.files.insert(
            "readme.txt".to_string(),
            File { content: "Filesystem mounted. Crypto module loaded separately.".to_string() }
        );

        home.subdirs.insert("kali".to_string(), kali);
        root.subdirs.insert("home".to_string(), home);
        root.subdirs.insert("bin".to_string(), Directory::new());

        TerminalSystem {
            root,
            current_path: vec!["home".to_string(), "kali".to_string()],
            user: "root@kali".to_string(),
        }
    }

    pub fn execute_command(&mut self, input: &str) -> String {
        let parts: Vec<&str> = input.trim().split_whitespace().collect();
        if parts.is_empty() { return "".to_string(); }

        let command = parts[0];
        let args = &parts[1..];

        match command {
            "ls" => self.cmd_ls(),
            "pwd" => self.cmd_pwd(),
            "cd" => if args.is_empty() { "".to_string() } else { self.cmd_cd(args[0]) },
            "cat" => if args.is_empty() { "".to_string() } else { self.cmd_cat(args[0]) },
            "whoami" => self.user.clone(),

            // "session" wird jetzt vom Frontend selbst behandelt, nicht mehr hier
            "help" => "Commands: ls, cd, pwd, cat, whoami, session, connect, say".to_string(),
            _ => format!("bash: {}: command not found", command),
        }
    }

    // --- HELPER (Unverändert) ---
    fn get_current_dir_mut(&mut self) -> Option<&mut Directory> {
        let mut dir = &mut self.root;
        for segment in &self.current_path {
            if dir.subdirs.contains_key(segment) {
                dir = dir.subdirs.get_mut(segment).unwrap();
            } else { return None; }
        }
        Some(dir)
    }

    fn cmd_ls(&mut self) -> String {
        if let Some(dir) = self.get_current_dir_mut() {
            let mut output = String::new();
            for name in dir.subdirs.keys() { output.push_str(&format!("\x1b[1;34m{}/\x1b[0m  ", name)); }
            for name in dir.files.keys() { output.push_str(&format!("{}  ", name)); }
            output
        } else { "Error.".to_string() }
    }

    fn cmd_pwd(&self) -> String { format!("/{}", self.current_path.join("/")) }

    fn cmd_cat(&mut self, filename: &str) -> String {
        if let Some(dir) = self.get_current_dir_mut() {
            if let Some(file) = dir.files.get(filename) { return file.content.clone(); }
            return format!("cat: {}: No such file", filename);
        }
        "Error.".to_string()
    }

    fn cmd_cd(&mut self, target: &str) -> String {
        if target == ".." {
            if !self.current_path.is_empty() { self.current_path.pop(); }
            return "".to_string();
        }
        let dir = self.get_current_dir_mut();
        if let Some(d) = dir {
            if d.subdirs.contains_key(target) {
                self.current_path.push(target.to_string());
                return "".to_string();
            }
        }
        format!("bash: cd: {}: No such file", target)
    }
}