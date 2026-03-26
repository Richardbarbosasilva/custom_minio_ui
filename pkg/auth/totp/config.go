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
	"path/filepath"
	"strings"
	"time"

	"github.com/minio/pkg/v3/env"
)

const (
	ConsoleTOTPEnabled         = "CONSOLE_TOTP_ENABLED"
	ConsoleTOTPIssuer          = "CONSOLE_TOTP_ISSUER"
	ConsoleTOTPStorePath       = "CONSOLE_TOTP_STORE_PATH"
	ConsoleTOTPChallengeExpiry = "CONSOLE_TOTP_CHALLENGE_EXPIRY"
)

func Enabled() bool {
	switch strings.ToLower(strings.TrimSpace(env.Get(ConsoleTOTPEnabled, "on"))) {
	case "1", "on", "true", "yes":
		return true
	default:
		return false
	}
}

func Issuer() string {
	issuer := strings.TrimSpace(env.Get(ConsoleTOTPIssuer, "MinIO Console"))
	if issuer == "" {
		return "MinIO Console"
	}

	return issuer
}

func StorePath() string {
	storePath := strings.TrimSpace(env.Get(ConsoleTOTPStorePath, "/data/.minio.sys/config/console/totp-users.json"))
	if storePath == "" {
		return "/data/.minio.sys/config/console/totp-users.json"
	}

	return filepath.Clean(storePath)
}

func ChallengeExpiry() time.Duration {
	duration, err := time.ParseDuration(env.Get(ConsoleTOTPChallengeExpiry, "10m"))
	if err != nil || duration <= 0 {
		return 10 * time.Minute
	}

	return duration
}
