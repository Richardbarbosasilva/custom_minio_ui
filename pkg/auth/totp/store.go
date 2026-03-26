// This file is part of MinIO Console Server
// Copyright (c) 2026 MinIO, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

package totp

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/pquerna/otp/totp"
)

type Record struct {
	URL        string     `json:"url"`
	Verified   bool       `json:"verified"`
	CreatedAt  time.Time  `json:"createdAt"`
	VerifiedAt *time.Time `json:"verifiedAt,omitempty"`
}

type fileStore struct {
	Users map[string]Record `json:"users"`
}

type Store struct {
	mu sync.Mutex
}

var defaultStore = &Store{}

func DefaultStore() *Store {
	return defaultStore
}

func (s *Store) Get(accountKey string) (Record, bool, error) {
	accountKey = strings.TrimSpace(accountKey)
	if accountKey == "" {
		return Record{}, false, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.load()
	if err != nil {
		return Record{}, false, err
	}

	record, ok := state.Users[accountKey]
	return record, ok, nil
}

func (s *Store) GetOrCreate(accountKey string) (Record, bool, error) {
	accountKey = strings.TrimSpace(accountKey)
	if accountKey == "" {
		return Record{}, false, errors.New("account key cannot be empty")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.load()
	if err != nil {
		return Record{}, false, err
	}

	if record, ok := state.Users[accountKey]; ok && record.URL != "" {
		return record, false, nil
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      Issuer(),
		AccountName: accountKey,
	})
	if err != nil {
		return Record{}, false, err
	}

	record := Record{
		URL:       key.URL(),
		Verified:  false,
		CreatedAt: time.Now().UTC(),
	}

	if state.Users == nil {
		state.Users = map[string]Record{}
	}

	state.Users[accountKey] = record
	if err = s.save(state); err != nil {
		return Record{}, false, err
	}

	return record, true, nil
}

func (s *Store) MarkVerified(accountKey string) error {
	accountKey = strings.TrimSpace(accountKey)
	if accountKey == "" {
		return errors.New("account key cannot be empty")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.load()
	if err != nil {
		return err
	}

	record, ok := state.Users[accountKey]
	if !ok {
		return errors.New("totp record not found")
	}

	if record.Verified {
		return nil
	}

	now := time.Now().UTC()
	record.Verified = true
	record.VerifiedAt = &now
	state.Users[accountKey] = record

	return s.save(state)
}

func (s *Store) load() (fileStore, error) {
	state := fileStore{
		Users: map[string]Record{},
	}

	raw, err := os.ReadFile(StorePath())
	if errors.Is(err, os.ErrNotExist) {
		return state, nil
	}
	if err != nil {
		return fileStore{}, err
	}

	if len(raw) == 0 {
		return state, nil
	}

	if err = json.Unmarshal(raw, &state); err != nil {
		return fileStore{}, err
	}

	if state.Users == nil {
		state.Users = map[string]Record{}
	}

	return state, nil
}

func (s *Store) save(state fileStore) error {
	if state.Users == nil {
		state.Users = map[string]Record{}
	}

	storePath := StorePath()
	storeDir := filepath.Dir(storePath)
	if err := os.MkdirAll(storeDir, 0o700); err != nil {
		return err
	}

	tmpFile, err := os.CreateTemp(storeDir, "totp-*.json")
	if err != nil {
		return err
	}

	tmpName := tmpFile.Name()

	cleanup := func() {
		_ = tmpFile.Close()
		_ = os.Remove(tmpName)
	}

	if err = tmpFile.Chmod(0o600); err != nil {
		cleanup()
		return err
	}

	encoder := json.NewEncoder(tmpFile)
	encoder.SetIndent("", "  ")
	if err = encoder.Encode(state); err != nil {
		cleanup()
		return err
	}

	if err = tmpFile.Close(); err != nil {
		_ = os.Remove(tmpName)
		return err
	}

	return os.Rename(tmpName, storePath)
}
