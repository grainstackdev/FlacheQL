import React, { Component } from 'react';
import gql from 'graphql-tag';
import GitBox from "./GitBox.jsx";
import QueryTimer from './QueryTimer.jsx';
import CacheNotifier from './CacheNotifier.jsx';
import Flache from '../flache';
import { CleanQuery } from '../helpers'
import Documentation from './Documentation.jsx';
import Instructions from './InstructionModal.jsx';
import { Router, Route, hashHistory } from 'react-router';

class Main extends Component {
  constructor(props) {
    super(props);
    /* Flache Implementation */
    this.cache = new Flache();
    this.state = {
      moreOptions: {
        createdAt: false,  
        databaseId: false,
        homepageUrl: false,
        updatedAt: false
      },
      gitBoxes: [],
      flacheTimer: {
        reqStartTime: null,
        lastQueryTime: 'Please wait...',
        timerText: 'Last query fetched 0 results in',
      },
      flacheTimerClass: "timerF",
      apolloTimer: {
        reqStartTime: null,
        lastQueryTime: 'Please submit query...',
        timerText: 'Last query fetched 0 results in',
      },
      apolloTimerClass: "timerF",
      showCacheHit: true,
      activeModal: null
    };

    this.handleMoreOptions = this.handleMoreOptions.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.getRepos = this.getRepos.bind(this);
    this.handleResponse = this.handleResponse.bind(this);
    this.buildBoxes = this.buildBoxes.bind(this);
    this.startTimer = this.startTimer.bind(this);
    this.endTimer = this.endTimer.bind(this);
    this.flashTimer = this.flashTimer.bind(this);
    this.apolloClient = this.props.client;
    this.hideModal = this.hideModal.bind(this);
    this.showModal = this.showModal.bind(this);
  }

  /* Modal Display */
  hideModal() {
    this.setState({ activeModal: null })
  }

  showModal() {
    this.setState({ activeModal: Instructions })
  }  

  /* initial modal render */
  componentDidMount() {
    console.log('mounted, active modal: ', this.state.activeModal);
    setTimeout(() => {this.showModal();}, 250)
    this.cache.readFromSessionStorage();
    setTimeout(() => {
      this.getRepos('react', 'javascript', 50000, 100, ['']);
    }, 1000);
  }

  componentWillUnmount() {
    this.cache.saveToSessionStorage();
  }



  // function to call 
  getRepos(terms, languages, stars, num, extraFields) {
    const endpoint = 'https://api.github.com/graphql'
    const headers = { "Content-Type": "application/graphql", "Authorization": "token d5db50499aa5e2c144546249bff744d6b99cf87d" }
    const variables = { 
      terms,
      languages,
      stars,
      num,
    }
    const options = {
      paramRetrieval: true,
      fieldRetrieval: true,
      defineSubsets: {
        "terms": "=",
        "languages": "> string",
        "stars": ">= number",
        "num": "<= number"
      },
      queryPaths: {
        "stars": "node.stargazers.totalCount" 
      },
      pathToNodes: "data.search.edges"
    }
    const flacheQuery = this.buildQuery(terms, languages, stars, num, true, extraFields);
    const apolloQuery = this.buildQuery(terms, languages, stars, num, false, extraFields);
    // start apollo timer - THAT'S RIGHT WE RUN THEM FIRST - NO SHENANIGANS
    this.startTimer(false, num);
    // launch apollo query
    this.apolloClient.query({ query: apolloQuery }).then(res => this.handleResponse(res.data, false));
    // start flache timer
    this.startTimer(true, num);
    // launch flache query
    this.cache.it(flacheQuery, variables, endpoint, headers, options)
      .then(res => {
        this.handleResponse(res.data, true)
      });
  }

  buildQuery(terms, languages, stars, num, flache, extraFields) {
    if (!num || num === 0) return window.alert('bad query! you must enter a number to search for!');
    if (!terms || terms === 'graphql');
    if (num > 100) return window.alert('max 100 results!');
    const searchQuery = `"${terms || ''}${languages ? ' language:' + languages : ''}${stars ? ' stars:>' + stars : ''}"`;
    if (searchQuery === '""') return window.alert('bad query! you must enter at least one filter!');
    let str = ''; // 'createdAt databaseId'
    extraFields.forEach(e => str += '\n' + e);
    return flache ? `{
      search(query: ${searchQuery}, type: REPOSITORY, first: ${num}) {
        repositoryCount
        edges {
          node {
            ... on Repository {
              name
              ${str}
              descriptionHTML
              stargazers {
                totalCount
              }
              forks {
                totalCount
              }
              updatedAt
            }
          }
        }
      }
    }` :
    gql`{
      search(query: ${searchQuery}, type: REPOSITORY, first: ${num}) {
        repositoryCount
        edges {
          node {
            ... on Repository {
              name
              ${str}
              description
              stargazers {
                totalCount
              }
              forks {
                totalCount
              }
            }
          }
        }
      }
    }`;
  }

  /**
  * Function to call when response is received from either the cache or from a fetch.
  * @param {object} res The response data from a cache hit or fetch
  * @param {boolean} flache Determines which timer to update, true for Flache, false for Apollo
  */
  handleResponse(res, flache) {
    this.endTimer(flache, res.search.edges.length);
    this.buildBoxes(res);
  }

  buildBoxes(res) { //map values
    const newBoxes = res.search.edges.map((repo, index) => {
      return <GitBox key={`b${index}`} name={repo.node.name} stars={repo.node.stargazers.totalCount} forks={repo.node.forks.totalCount} 
      description={repo.node.description} createdAt={repo.node.createdAt} databaseId={repo.node.databaseId} 
      updatedAt={repo.node.updatedAt} homepageUrl={repo.node.homepageUrl} moreOptions={this.state.moreOptions} />
    });
    this.setState({ gitBoxes: newBoxes });
  }

  startTimer(flache, num) {
    const reqStartTime = window.performance.now();
    const updatedTimer = { timerText: `Fetching ${num} items...`, reqStartTime, lastQueryTime: 'Please wait...' };
    // update either the flache or apollo timer
    if (flache) this.setState({ flacheTimer: updatedTimer });
    else this.setState({ apolloTimer: updatedTimer });
  }

  /**
  * Stops the timer for a caching engine and displays the number of 
  * @param {boolean} flache Determines which timer to update, true for Flache, false for Apollo
  */
  endTimer(flache, num) {
    let lastQueryTime = flache ? `${window.performance.now() - this.state.flacheTimer.reqStartTime}` : `${window.performance.now() - this.state.apolloTimer.reqStartTime}`;
    lastQueryTime = lastQueryTime.slice(0, lastQueryTime.indexOf('.') + 4) + ' ms';
    const updatedTimer = { timerText: `Last query fetched ${num} results in`, lastQueryTime, reqStartTime: null };
    // update either the flache or apollo timer
    if (flache) this.setState({ flacheTimer: updatedTimer });
    else this.setState({ apolloTimer: updatedTimer });
    this.flashTimer(flache);
  }

  /**
  * Simple flash effect for timer
  * @param {boolean} flache Determines which timer to update, true for Flache, false for Apollo
  */

  flashTimer(flache) {
    if (flache) {
      this.setState({ flacheTimerClass: "timerF flashF" });
      setTimeout(() => this.setState({ flacheTimerClass: "timerF" }), 200);
    } else {
      this.setState({ apolloTimerClass: "timerA flashA" });
      setTimeout(() => this.setState({ apolloTimerClass: "timerA" }), 200);
    }
  }

  /** Handles changes to the More Options checkboxes and updates state to reflect */
  handleMoreOptions() {
    const saveOptions = [];
    const updateOptions = {};
    const options = document.getElementsByClassName('searchOptions');
    for (let i = 0; i < options.length; i++) {
      if (options[i].checked) {
        saveOptions.push(options[i].value);
        updateOptions[options[i].value] = [true, options[i].value];
      } else updateOptions[options[i].value] = false;
    } 
    this.setState({ moreOptions: updateOptions });
    return saveOptions;
  }

  /** Fired on search, collects input fields and calls getRepos */
  handleSubmit() {
    const extraFields = this.handleMoreOptions();
    this.getRepos(
      document.getElementById('searchText').value,
      document.getElementById('searchLang').value,
      Number(document.getElementById('searchStars').value),
      document.getElementById('searchNum').value,
      extraFields,
    );
  }

  
  render() {
    return (
      <div className="main-container">
        <div id="top-wrapper">
        {/* Modal Control */}
        {this.state.activeModal === Instructions ? 
          <Instructions isOpen={this.state.activeModal} onClose={this.hideModal} onEscape={this.escapeKey}>
              <p>Modal</p>
          </Instructions>
          : <div></div>
        }
        {/* Document Body */}
          <div id="form-wrapper">
            <h2>Find Github Repositories</h2>
            <div className="searchBoxes">
              <label>Search: <input id="searchText" type="text" className="text"/></label>
            </div>
            <div className="searchBoxes">
              <label>Language: <input id="searchLang" type="text" className="text"/></label>
            </div>
            <div className="searchBoxes">
              <label># of ☆: <input id="searchStars" type="text" className="text"/></label>
            </div>
            <div className="searchBoxes">
              <label># to fetch: <input id="searchNum" type="text" className="text"/></label>
            </div>
            <fieldset>
              <legend>More Options</legend>
              <div>
              <label><input id="databaseId" type="checkbox" className="searchOptions" value="databaseId"/> database Id</label><br/>
              <label><input id="createdAt" type="checkbox" className="searchOptions" value="createdAt"/> created At</label><br/>
              <label><input id="updatedAt" type="checkbox" className="searchOptions" value="updatedAt"/> updated At</label><br/>
              <label><input id="homepageUrl" type="checkbox" className="searchOptions" value="homepageUrl"/> homepage Url</label>
              </div>
            </fieldset>
          </div>
          {/* Timer Displays */}
          <div id="top-right-wrapper">
            <div id="timer-wrapper">
              <QueryTimer
                class={this.state.flacheTimerClass}
                title="FlacheQL"
                lastQueryTime={this.state.flacheTimer.lastQueryTime}
                timerText={this.state.flacheTimer.timerText}
              />
              <QueryTimer
                class={this.state.apolloTimerClass}
                title="Apollo"
                lastQueryTime={this.state.apolloTimer.lastQueryTime}
                timerText={this.state.apolloTimer.timerText}
              />
            </div>
            <div id="buttons">
              <input type="button" value="Search" onClick={() => this.handleSubmit([''])} />
              <input type="button" value="Delete Session Storage" onClick={() => sessionStorage.clear()} />
            </div>
          </div>
        </div>
        <div className="result-list">
          {this.state.gitBoxes}
        </div>
      </div>
    )
  }
}

export default Main;