// This file is part of MinIO Console Server
// Copyright (c) 2021 MinIO, Inc.
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

package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"testing"

	authApi "github.com/minio/console/api/operations/auth"
	"github.com/minio/console/models"
	consoleAuth "github.com/minio/console/pkg/auth"
	"github.com/minio/madmin-go/v3"

	iampolicy "github.com/minio/pkg/v3/policy"

	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/stretchr/testify/assert"
)

// Define a mock struct of ConsoleCredentialsI interface implementation
type consoleCredentialsMock struct{}

func (ac consoleCredentialsMock) GetActions() []string {
	return []string{}
}

func (ac consoleCredentialsMock) GetAccountAccessKey() string {
	return ""
}

// Common mocks
var consoleCredentialsGetMock func() (credentials.Value, error)

// mock function of Get()
func (ac consoleCredentialsMock) Get() (credentials.Value, error) {
	return consoleCredentialsGetMock()
}

func TestLogin(t *testing.T) {
	funcAssert := assert.New(t)
	consoleCredentials := consoleCredentialsMock{}
	// Test Case 1: Valid consoleCredentials
	consoleCredentialsGetMock = func() (credentials.Value, error) {
		return credentials.Value{
			AccessKeyID:     "fakeAccessKeyID",
			SecretAccessKey: "fakeSecretAccessKey",
			SessionToken:    "fakeSessionToken",
			SignerType:      0,
		}, nil
	}
	token, err := login(consoleCredentials, nil)
	funcAssert.NotEmpty(token, "Token was returned empty")
	funcAssert.Nil(err, "error creating a session")

	// Test Case 2: Invalid credentials
	consoleCredentialsGetMock = func() (credentials.Value, error) {
		return credentials.Value{}, errors.New("")
	}
	_, err = login(consoleCredentials, nil)
	funcAssert.NotNil(err, "not error returned creating a session")
}

func Test_getAccountInfo(t *testing.T) {
	type args struct {
		ctx context.Context
	}
	tests := []struct {
		name     string
		args     args
		want     *iampolicy.Policy
		wantErr  bool
		mockFunc func(client *AdminClientMock)
	}{
		{
			name: "error getting account info",
			args: args{
				ctx: context.Background(),
			},
			want:    nil,
			wantErr: true,
			mockFunc: func(client *AdminClientMock) {
				client.minioAccountInfoMock = func(_ context.Context) (madmin.AccountInfo, error) {
					return madmin.AccountInfo{}, errors.New("something went wrong")
				}
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(_ *testing.T) {
			client := AdminClientMock{}
			if tt.mockFunc != nil {
				tt.mockFunc(&client)
			}
			got, err := getAccountInfo(tt.args.ctx, client)
			if (err != nil) != tt.wantErr {
				t.Errorf("getAccountInfo() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if tt.want != nil {
				if !reflect.DeepEqual(got, tt.want) {
					t.Errorf("getAccountInfo() got = %v, want %v", got, tt.want)
				}
			}
		})
	}
}

func Test_getLoginResponseFallsBackToLDAP(t *testing.T) {
	origGetConsole := getConsoleCredentialsForLogin
	origGetLDAP := getLDAPConsoleCredentialsForLogin
	origLogin := loginForSession
	origLDAPEnabled, hadLDAPEnabled := os.LookupEnv("CONSOLE_LDAP_ENABLED")

	t.Cleanup(func() {
		getConsoleCredentialsForLogin = origGetConsole
		getLDAPConsoleCredentialsForLogin = origGetLDAP
		loginForSession = origLogin
		if hadLDAPEnabled {
			_ = os.Setenv("CONSOLE_LDAP_ENABLED", origLDAPEnabled)
		} else {
			_ = os.Unsetenv("CONSOLE_LDAP_ENABLED")
		}
	})

	_ = os.Setenv("CONSOLE_LDAP_ENABLED", "on")

	getConsoleCredentialsForLogin = func(accessKey, secretKey string, client *http.Client) (*ConsoleCredentials, error) {
		return &ConsoleCredentials{AccountAccessKey: accessKey}, nil
	}
	getLDAPConsoleCredentialsForLogin = func(accessKey, secretKey string, client *http.Client) (*ConsoleCredentials, error) {
		return &ConsoleCredentials{AccountAccessKey: accessKey}, nil
	}

	loginCalls := 0
	loginForSession = func(credentials ConsoleCredentialsI, sessionFeatures *consoleAuth.SessionFeatures) (*string, error) {
		loginCalls++
		if loginCalls == 1 {
			return nil, ErrInvalidLogin
		}
		sessionID := "ldap-session"
		return &sessionID, nil
	}

	params := authApi.LoginParams{
		HTTPRequest: httptest.NewRequest(http.MethodPost, "/api/v1/login", nil),
		Body: &models.LoginRequest{
			AccessKey: "ldap.teste",
			SecretKey: "Ri21851619!",
		},
	}

	resp, err := getLoginResponse(params)
	assert.Nil(t, err)
	assert.NotNil(t, resp)
	assert.Equal(t, "ldap-session", resp.SessionID)
	assert.Equal(t, 2, loginCalls)
}

func Test_getLoginResponseDoesNotFallbackWhenLDAPDisabled(t *testing.T) {
	origGetConsole := getConsoleCredentialsForLogin
	origGetLDAP := getLDAPConsoleCredentialsForLogin
	origLogin := loginForSession
	origLDAPEnabled, hadLDAPEnabled := os.LookupEnv("CONSOLE_LDAP_ENABLED")

	t.Cleanup(func() {
		getConsoleCredentialsForLogin = origGetConsole
		getLDAPConsoleCredentialsForLogin = origGetLDAP
		loginForSession = origLogin
		if hadLDAPEnabled {
			_ = os.Setenv("CONSOLE_LDAP_ENABLED", origLDAPEnabled)
		} else {
			_ = os.Unsetenv("CONSOLE_LDAP_ENABLED")
		}
	})

	_ = os.Setenv("CONSOLE_LDAP_ENABLED", "off")

	getConsoleCredentialsForLogin = func(accessKey, secretKey string, client *http.Client) (*ConsoleCredentials, error) {
		return &ConsoleCredentials{AccountAccessKey: accessKey}, nil
	}
	getLDAPConsoleCredentialsForLogin = func(accessKey, secretKey string, client *http.Client) (*ConsoleCredentials, error) {
		t.Fatal("LDAP fallback should be disabled")
		return nil, nil
	}
	loginForSession = func(credentials ConsoleCredentialsI, sessionFeatures *consoleAuth.SessionFeatures) (*string, error) {
		return nil, ErrInvalidLogin
	}

	params := authApi.LoginParams{
		HTTPRequest: httptest.NewRequest(http.MethodPost, "/api/v1/login", nil),
		Body: &models.LoginRequest{
			AccessKey: "ldap.teste",
			SecretKey: "Ri21851619!",
		},
	}

	resp, err := getLoginResponse(params)
	assert.Nil(t, resp)
	assert.NotNil(t, err)
	assert.Equal(t, 401, err.Code)
	assert.Equal(t, ErrInvalidLogin.Error(), err.APIError.Message)
}
