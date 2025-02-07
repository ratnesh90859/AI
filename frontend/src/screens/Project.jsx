// Import statements
import React, { useState, useEffect, useContext, useRef } from 'react'
import { UserContext } from '../context/user.context'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from '../config/axios'
import { initializeSocket, receiveMessage, sendMessage } from '../config/socket'
import Markdown from 'markdown-to-jsx'
import hljs from 'highlight.js'
import { getWebContainer } from '../config/webcontainer'

// SyntaxHighlightedCode component
function SyntaxHighlightedCode(props) {
    const ref = useRef(null)

    React.useEffect(() => {
        if (ref.current && props.className?.includes('lang-') && window.hljs) {
            window.hljs.highlightElement(ref.current)
            ref.current.removeAttribute('data-highlighted')
        }
    }, [props.className, props.children])

    return <code {...props} ref={ref} />
}

// Main Project component
const Project = () => {
    const location = useLocation()
    const navigate = useNavigate()
    
    // State declarations
    const [isSidePanelOpen, setIsSidePanelOpen] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedUserId, setSelectedUserId] = useState(new Set())
    const [project, setProject] = useState(location.state?.project)
    const [message, setMessage] = useState('')
    const { user } = useContext(UserContext)
    const messageBox = useRef()

    const [users, setUsers] = useState([])
    const [messages, setMessages] = useState([])
    const [fileTree, setFileTree] = useState({})
    const [currentFile, setCurrentFile] = useState(null)
    const [openFiles, setOpenFiles] = useState([])
    const [webContainer, setWebContainer] = useState(null)
    const [iframeUrl, setIframeUrl] = useState(null)
    const [runProcess, setRunProcess] = useState(null)

    // Handler functions
    const handleUserClick = (id) => {
        setSelectedUserId(prevSelectedUserId => {
            const newSelectedUserId = new Set(prevSelectedUserId)
            if (newSelectedUserId.has(id)) {
                newSelectedUserId.delete(id)
            } else {
                newSelectedUserId.add(id)
            }
            return newSelectedUserId
        })
    }

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
        }
    }

    const addCollaborators = async () => {
        try {
            const response = await axios.put("/projects/add-user", {
                projectId: project._id,
                users: Array.from(selectedUserId)
            })
            setProject(response.data.project)
            setIsModalOpen(false)
        } catch (error) {
            console.error('Error adding collaborators:', error)
        }
    }

    const send = () => {
        if (!message.trim()) return
        
        const messageObj = {
            message,
            sender: user,
            timestamp: Date.now()
        }
        
        try {
            sendMessage('project-message', messageObj)
            setMessages(prevMessages => [...prevMessages, { ...messageObj, id: Date.now() }])
            setMessage("")
        } catch (error) {
            console.error('Error sending message:', error)
        }
    }

    function WriteAiMessage(message) {
        try {
            const messageObject = JSON.parse(message)
            return (
                <div className='overflow-auto bg-slate-950 text-white rounded-sm p-2'>
                    <Markdown
                        children={messageObject.text}
                        options={{
                            overrides: {
                                code: SyntaxHighlightedCode,
                            },
                        }}
                    />
                </div>
            )
        } catch (error) {
            console.error('Error parsing AI message:', error)
            return <div className='overflow-auto bg-slate-950 text-white rounded-sm p-2'>{message}</div>
        }
    }

    async function saveFileTree(ft) {
        try {
            const response = await axios.put('/projects/update-file-tree', {
                projectId: project._id,
                fileTree: ft
            })
            console.log('File tree saved:', response.data)
        } catch (error) {
            console.error('Error saving file tree:', error)
        }
    }

    const handleRunProject = async () => {
        try {
            await webContainer.mount(fileTree)

            const installProcess = await webContainer.spawn("npm", ["install"])

            installProcess.output.pipeTo(new WritableStream({
                write(chunk) {
                    console.log(chunk)
                }
            }))

            if (runProcess) {
                runProcess.kill()
            }

            const tempRunProcess = await webContainer.spawn("npm", ["start"])

            tempRunProcess.output.pipeTo(new WritableStream({
                write(chunk) {
                    console.log(chunk)
                }
            }))

            setRunProcess(tempRunProcess)

            webContainer.on('server-ready', (port, url) => {
                setIframeUrl(url)
            })
        } catch (error) {
            console.error('Error running project:', error)
        }
    }

    // useEffect hook
    useEffect(() => {
        if (!location.state?.project) {
            navigate('/')
            return
        }

        const setupProject = async () => {
            try {
                initializeSocket(project._id)

                if (!webContainer) {
                    const container = await getWebContainer()
                    setWebContainer(container)
                    console.log("container started")
                }

                receiveMessage('project-message', data => {
                    try {
                        if (data.sender._id === 'ai') {
                            let parsedMessage
                            try {
                                parsedMessage = JSON.parse(data.message)
                                if (parsedMessage.fileTree) {
                                    setFileTree(parsedMessage.fileTree)
                                    webContainer?.mount(parsedMessage.fileTree)
                                }
                            } catch (error) {
                                console.error('Error parsing AI message:', error)
                            }
                        }
                        setMessages(prevMessages => [...prevMessages, { ...data, id: Date.now() }])
                    } catch (error) {
                        console.error('Error processing message:', error)
                    }
                })

                const projectResponse = await axios.get(`/projects/get-project/${project._id}`)
                setProject(projectResponse.data.project)
                setFileTree(projectResponse.data.project.fileTree || {})

                const usersResponse = await axios.get('/users/all')
                setUsers(usersResponse.data.users)

            } catch (error) {
                console.error('Error setting up project:', error)
            }
        }

        setupProject()

        return () => {
            if (runProcess) {
                runProcess.kill()
            }
        }
    }, [])

    // Render method
    return (
        <main className='h-screen w-screen flex'>
            <section className="left relative flex flex-col h-screen min-w-96 bg-slate-300">
                <header className='flex justify-between items-center p-2 px-4 w-full bg-slate-100 absolute z-10 top-0'>
                    <button className='flex gap-2' onClick={() => setIsModalOpen(true)}>
                        <i className="ri-add-fill mr-1"></i>
                        <p>Add collaborator</p>
                    </button>
                    <button onClick={() => setIsSidePanelOpen(!isSidePanelOpen)} className='p-2'>
                        <i className="ri-group-fill"></i>
                    </button>
                </header>

                <div className="conversation-area pt-14 pb-10 flex-grow flex flex-col h-full relative">
                    <div ref={messageBox} className="message-box p-1 flex-grow flex flex-col gap-1 overflow-auto max-h-full scrollbar-hide">
                        {messages.map((msg) => (
                            <div 
                                key={msg.id || `${Date.now()}-${Math.random()}`}
                                className={`${msg.sender._id === 'ai' ? 'max-w-80' : 'max-w-52'} 
                                    ${msg.sender._id === user._id.toString() && 'ml-auto'} 
                                    message flex flex-col p-2 bg-slate-50 w-fit rounded-md`}
                            >
                                <small className='opacity-65 text-xs'>{msg.sender.email}</small>
                                <div className='text-sm'>
                                    {msg.sender._id === 'ai' ?
                                        WriteAiMessage(msg.message)
                                        : <p>{msg.message}</p>}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="inputField w-full flex absolute bottom-0">
                        <input
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyPress={handleKeyPress}
                            className='p-2 px-4 border-none outline-none flex-grow'
                            type="text"
                            placeholder='Enter message'
                        />
                        <button
                            onClick={send}
                            className='px-5 bg-slate-950 text-white'
                        >
                            <i className="ri-send-plane-fill"></i>
                        </button>
                    </div>
                </div>

                <div className={`sidePanel w-full h-full flex flex-col gap-2 bg-slate-50 absolute transition-all 
                    ${isSidePanelOpen ? 'translate-x-0' : '-translate-x-full'} top-0`}>
                    <header className='flex justify-between items-center px-4 p-2 bg-slate-200'>
                        <h1 className='font-semibold text-lg'>Collaborators</h1>
                        <button onClick={() => setIsSidePanelOpen(false)} className='p-2'>
                            <i className="ri-close-fill"></i>
                        </button>
                    </header>
                    <div className="users flex flex-col gap-2">
                        {project.users?.map(user => (
                            <div 
                                key={user._id}
                                className="user cursor-pointer hover:bg-slate-200 p-2 flex gap-2 items-center"
                            >
                                <div className='aspect-square rounded-full w-fit h-fit flex items-center justify-center p-5 text-white bg-slate-600'>
                                    <i className="ri-user-fill absolute"></i>
                                </div>
                                <h1 className='font-semibold text-lg'>{user.email}</h1>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="right bg-red-50 flex-grow h-full flex">
                <div className="explorer h-full max-w-64 min-w-52 bg-slate-200">
                    <div className="file-tree w-full">
                        {Object.keys(fileTree).map((file) => (
                            <button
                                key={file}
                                onClick={() => {
                                    setCurrentFile(file)
                                    setOpenFiles([...new Set([...openFiles, file])])
                                }}
                                className="tree-element cursor-pointer p-2 px-4 flex items-center gap-2 bg-slate-300 w-full"
                            >
                                <p className='font-semibold text-lg'>{file}</p>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="code-editor flex flex-col flex-grow h-full shrink">
                    <div className="top flex justify-between w-full">
                        <div className="files flex">
                            {openFiles.map((file) => (
                                <button
                                    key={file}
                                    onClick={() => setCurrentFile(file)}
                                    className={`open-file cursor-pointer p-2 px-4 flex items-center w-fit gap-2 bg-slate-300 
                                        ${currentFile === file ? 'bg-slate-400' : ''}`}
                                >
                                    <p className='font-semibold text-lg'>{file}</p>
                                </button>
                            ))}
                        </div>

                        <div className="actions flex gap-2">
                            <button
                                onClick={handleRunProject}
                                className='p-2 px-4 bg-slate-300 text-white'
                            >
                                run
                            </button>
                        </div>
                    </div>

                    <div className="bottom flex flex-grow max-w-full shrink overflow-auto">
                        {fileTree[currentFile] && (
                            <div className="code-editor-area h-full overflow-auto flex-grow bg-slate-50">
                                <pre className="hljs h-full">
                                    <code
                                        className="hljs h-full outline-none"
                                        contentEditable
                                        suppressContentEditableWarning
                                        onBlur={(e) => {
                                            const updatedContent = e.target.innerText
                                            const ft = {
                                                ...fileTree,
                                                [currentFile]: {
                                                    file: {
                                                        contents: updatedContent
                                                    }
                                                }
                                            }
                                            setFileTree(ft)
                                            saveFileTree(ft)
                                        }}
                                        dangerouslySetInnerHTML={{
                                            __html: hljs.highlight('javascript', fileTree[currentFile].file.contents).value
                                        }}
                                        style={{
                                            whiteSpace: 'pre-wrap',
                                            paddingBottom: '25rem',
                                            counterSet: 'line-numbering',
                                        }}
                                    />
                                </pre>
                            </div>
                        )}
                    </div>
                </div>

                {iframeUrl && webContainer && (
                    <div className="flex min-w-96 flex-col h-full">
                        <div className="address-bar">
                            <input 
                                type="text"
                                onChange={(e) => setIframeUrl(e.target.value)}
                                value={iframeUrl}
                                className="w-full p-2 px-4 bg-slate-200"
                            />
                        </div>
                        <iframe 
                            src={iframeUrl} 
                            className="w-full h-full"
                            title="Project Preview"
                        />
                    </div>
                )}
            </section>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="bg-white p-4 rounded-md w-96 max-w-full relative">
                        <header className='flex justify-between items-center mb-4'>
                            <h2 className='text-xl font-semibold'>Select Users</h2>
                            <h2 className='text-xl font-semibold'>Select Users</h2>
                            <button 
                                onClick={() => setIsModalOpen(false)} 
                                className='p-2'
                            >
                                <i className="ri-close-fill"></i>
                            </button>
                        </header>
                        <div className="users-list flex flex-col gap-2 mb-16 max-h-96 overflow-auto">
                            {users.map((user) => (
                                <div
                                    key={user._id}
                                    className={`user cursor-pointer hover:bg-slate-200 
                                        ${Array.from(selectedUserId).includes(user._id) ? 'bg-slate-200' : ''} 
                                        p-2 flex gap-2 items-center`}
                                    onClick={() => handleUserClick(user._id)}
                                >
                                    <div className='aspect-square relative rounded-full w-fit h-fit flex items-center justify-center p-5 text-white bg-slate-600'>
                                        <i className="ri-user-fill absolute"></i>
                                    </div>
                                    <h1 className='font-semibold text-lg'>{user.email}</h1>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={addCollaborators}
                            className='absolute bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors'
                            disabled={selectedUserId.size === 0}
                        >
                            Add Collaborators
                        </button>
                    </div>
                </div>
            )}
        </main>
    );
}

export default Project;